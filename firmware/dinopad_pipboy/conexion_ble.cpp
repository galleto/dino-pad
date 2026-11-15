// conexion_ble.cpp - ver conexion_ble.h
#include "conexion_ble.h"

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <esp_random.h>
#include <stdarg.h>

#include <atomic>

#include "compartido.h"
#include "datos_tracker.h"
#include "meshtastic_min.h"

// ===== CONFIGURACION =====
static const char*    MAC_TEXTO        = "f0:d4:6c:51:a6:bb";   // T1000-E (G93_a6bb)
static const uint32_t PIN_BLE          = 123456;
static const uint32_t ESCANEO_MS       = 15000;
static const uint32_t REINTENTO_MS     = 5000;    // espera tras una desconexion
static const uint32_t REINTENTO_PIN_MS = 30000;   // espera si fallo el emparejamiento
static const uint32_t SONDEO_MS        = 10000;   // leer FromRadio aunque no avise FromNum
static const uint32_t RSSI_MS          = 5000;
static const int      MAX_PAQUETES     = 600;
static const bool     VOLCADO          = false;   // true: imprime cada FromRadio por serial

// UUIDs de https://meshtastic.org/docs/development/device/client-api/
static const NimBLEUUID UUID_SERVICIO ("6ba1b218-15a8-461f-9fa8-5dcae273eafd");
static const NimBLEUUID UUID_TORADIO  ("f75c76d2-129e-4dad-a1dd-7866124401e7");
static const NimBLEUUID UUID_FROMRADIO("2c55e69e-4993-11ed-b878-0242ac120002");
static const NimBLEUUID UUID_FROMNUM  ("ed9da18c-a800-4f66-a670-aa7547e34453");

// Nonces especiales del firmware (src/mesh/PhoneAPI.h): se evitan
static const uint32_t SPECIAL_NONCE_ONLY_CONFIG = 69420;
static const uint32_t SPECIAL_NONCE_ONLY_NODES  = 69421;

// ===== ESTADO DE LA TAREA =====
static uint8_t macObjetivo[6];
static NimBLEAddress direccion;
static std::atomic<bool> encontrado{false};
static std::atomic<int> rssiAnuncio{0};
static std::atomic<bool> desconectado{false};
static std::atomic<uint32_t> avisosFromNum{0};
static NimBLEClient* cli = nullptr;
static NimBLERemoteCharacteristic* chToRadio = nullptr;
static NimBLERemoteCharacteristic* chFromRadio = nullptr;
static meshtastic_FromRadio fromRadio;   // 768 B: estatico, no en la pila de la tarea
static Estadisticas estadisticas;

static void logBle(const char* fmt, ...) {
  char buf[200];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof buf, fmt, ap);
  va_end(ap);
  Serial.print(buf);
}

static void ponerEstado(EstadoBle e, const char* motivo = nullptr, uint32_t reintentoEnMs = 0) {
  compartidoBloquear();
  Compartido& c = compartidoRef();
  c.estado = e;
  c.msEstado = millis();
  if (motivo) snprintf(c.motivo, sizeof c.motivo, "%s", motivo);
  c.reintentoMs = reintentoEnMs ? millis() + reintentoEnMs : 0;
  c.version++;
  compartidoSoltar();
  Serial.printf("[BLE] %s%s%s\n", nombreEstadoBle(e), motivo ? ": " : "", motivo ? motivo : "");
}

static void ponerRssi(int rssi) {
  compartidoBloquear();
  Compartido& c = compartidoRef();
  c.tieneRssi = true;
  c.rssi = rssi;
  c.msRssi = millis();
  c.version++;
  compartidoSoltar();
}

// ---------- Callbacks de NimBLE ----------
class CallbacksEscaneo : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* dev) override {
    if (encontrado) return;
    if (memcmp(dev->getAddress().getVal(), macObjetivo, 6) != 0) return;
    direccion = dev->getAddress();
    rssiAnuncio = dev->getRSSI();
    encontrado = true;
  }
} callbacksEscaneo;

class CallbacksCliente : public NimBLEClientCallbacks {
  void onDisconnect(NimBLEClient*, int reason) override {
    desconectado = true;
    Serial.printf("[BLE] (evento) desconectado, reason=%d\n", reason);
  }
  void onPassKeyEntry(NimBLEConnInfo& info) override {
    Serial.println("[BLE] (evento) el T1000-E pide PIN");
    NimBLEDevice::injectPassKey(info, PIN_BLE);
  }
  void onConfirmPasskey(NimBLEConnInfo& info, uint32_t) override {
    NimBLEDevice::injectConfirmPasskey(info, false);   // no deberia ocurrir (IO = teclado)
  }
} callbacksCliente;

// ---------- FromRadio ----------
// Lee hasta vacio. Devuelve paquetes leidos o -1 si fallo una lectura.
static int drenar(uint32_t nonce, bool* vioConfigComplete) {
  int n = 0;
  while (n < MAX_PAQUETES) {
    if (!cli->isConnected()) return -1;
    time_t ts = (time_t)-1;   // NimBLE solo lo escribe si la lectura fue exitosa
    NimBLEAttValue v = chFromRadio->readValue(&ts);
    if (ts == (time_t)-1) return -1;
    if (v.length() == 0) return n;
    n++;
    if (!decodificarFromRadio(v.data(), v.length(), &fromRadio)) {
      estadisticas.errores++;
      continue;
    }
    compartidoBloquear();
    Compartido& c = compartidoRef();
    procesarFromRadio(fromRadio, c.datos, estadisticas, millis(), VOLCADO ? logBle : nullptr);
    c.version++;
    compartidoSoltar();
    if (vioConfigComplete && fromRadio.which_payload_variant == meshtastic_FromRadio_config_complete_id_tag &&
        fromRadio.config_complete_id == nonce)
      *vioConfigComplete = true;
    vTaskDelay(1);   // dejar respirar a otras tareas en rafagas largas
  }
  return n;
}

// ---------- Una conexion completa. Devuelve cuanto esperar antes de reintentar ----------
static uint32_t conectarYEscuchar() {
  // [1] Escaneo
  ponerEstado(EstadoBle::BUSCANDO);
  encontrado = false;
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->start(ESCANEO_MS, false, true);
  uint32_t t0 = millis();
  while (!encontrado && millis() - t0 < ESCANEO_MS + 500) vTaskDelay(pdMS_TO_TICKS(20));
  scan->stop();
  if (!encontrado) {
    ponerEstado(EstadoBle::DESCONECTADO, "tracker no encontrado", REINTENTO_MS);
    return REINTENTO_MS;
  }
  ponerRssi(rssiAnuncio);

  // [2] Conexion
  ponerEstado(EstadoBle::CONECTANDO);
  desconectado = false;
  if (!cli->connect(direccion, true, false, true)) {
    ponerEstado(EstadoBle::DESCONECTADO, "no se pudo conectar (otro cliente?)", REINTENTO_MS);
    return REINTENTO_MS;
  }

  // [3] Emparejamiento
  ponerEstado(EstadoBle::EMPAREJANDO);
  bool seguro = cli->secureConnection();
  if (!seguro || !cli->getConnInfo().isEncrypted()) {
    cli->disconnect();
    ponerEstado(EstadoBle::DESCONECTADO, "emparejamiento fallido (PIN?)", REINTENTO_PIN_MS);
    return REINTENTO_PIN_MS;
  }

  // [4] Servicio y caracteristicas
  NimBLERemoteService* svc = cli->getService(UUID_SERVICIO);
  chToRadio = svc ? svc->getCharacteristic(UUID_TORADIO) : nullptr;
  chFromRadio = svc ? svc->getCharacteristic(UUID_FROMRADIO) : nullptr;
  NimBLERemoteCharacteristic* chFromNum = svc ? svc->getCharacteristic(UUID_FROMNUM) : nullptr;
  if (!chToRadio || !chFromRadio || !chFromNum) {
    cli->disconnect();
    ponerEstado(EstadoBle::DESCONECTADO, "sin servicio Meshtastic", REINTENTO_MS);
    return REINTENTO_MS;
  }
  avisosFromNum = 0;
  if (chFromNum->canNotify())
    chFromNum->subscribe(true, [](NimBLERemoteCharacteristic*, uint8_t*, size_t, bool) { avisosFromNum++; });

  // [5] Configuracion inicial
  ponerEstado(EstadoBle::LEYENDO_CONFIG);
  uint32_t nonce;
  do { nonce = esp_random(); } while (nonce == 0 || nonce == SPECIAL_NONCE_ONLY_CONFIG ||
                                      nonce == SPECIAL_NONCE_ONLY_NODES);
  uint8_t buf[16];
  size_t n = mt::encodeWantConfig(buf, sizeof buf, nonce);
  if (!n || !chToRadio->writeValue(buf, n, true)) {
    cli->disconnect();
    ponerEstado(EstadoBle::DESCONECTADO, "fallo want_config_id", REINTENTO_MS);
    return REINTENTO_MS;
  }
  bool completo = false;
  int leidos = drenar(nonce, &completo);
  if (leidos < 0) {
    if (cli->isConnected()) cli->disconnect();
    ponerEstado(EstadoBle::DESCONECTADO, "se corto leyendo la config", REINTENTO_MS);
    return REINTENTO_MS;
  }
  compartidoBloquear();
  compartidoRef().paquetesConfig = leidos;
  compartidoRef().conexiones++;
  compartidoSoltar();
  Serial.printf("[BLE] configuracion: %d paquetes%s\n", leidos, completo ? ", completa" : "");

  // [6] Escuchar hasta que se corte
  ponerEstado(EstadoBle::CONECTADO);
  uint32_t ultimoSondeo = millis(), ultimoRssi = 0;
  while (cli->isConnected() && !desconectado) {
    uint32_t ahora = millis();
    if (avisosFromNum > 0 || ahora - ultimoSondeo >= SONDEO_MS) {
      avisosFromNum = 0;
      ultimoSondeo = ahora;
      if (drenar(0, nullptr) < 0) break;
    }
    if (ahora - ultimoRssi >= RSSI_MS) {
      ultimoRssi = ahora;
      int r = cli->getRssi();
      if (r != 0) ponerRssi(r);
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
  if (cli->isConnected()) cli->disconnect();
  ponerEstado(EstadoBle::DESCONECTADO, "el tracker cerro la conexion", REINTENTO_MS);
  return REINTENTO_MS;
}

static void tareaBle(void*) {
  NimBLEAddress tmp(std::string(MAC_TEXTO), BLE_ADDR_PUBLIC);
  memcpy(macObjetivo, tmp.getVal(), 6);

  NimBLEDevice::init("dinopad");
  NimBLEDevice::setMTU(512);
  NimBLEDevice::setSecurityAuth(true, true, true);          // bonding, MITM, secure connections
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_KEYBOARD_ONLY);  // el ESP32 "teclea" el PIN

  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setScanCallbacks(&callbacksEscaneo, false);
  scan->setActiveScan(true);
  scan->setInterval(100);
  scan->setWindow(99);
  scan->setMaxResults(0);   // hay cientos de anuncios alrededor: no guardarlos

  cli = NimBLEDevice::createClient();
  cli->setClientCallbacks(&callbacksCliente, false);
  cli->setConnectTimeout(10000);

  for (;;) {
    uint32_t espera = conectarYEscuchar();
    vTaskDelay(pdMS_TO_TICKS(espera));
  }
}

void bleIniciar() {
  // Nucleo 0 (donde corre el stack BLE); loop() de Arduino corre en el nucleo 1.
  xTaskCreatePinnedToCore(tareaBle, "ble", 10240, nullptr, 2, nullptr, 0);
}
