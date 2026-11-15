// ble_send: el ESP32 se conecta por BLE al T1000-E (Meshtastic) con PIN, lee su
// configuracion y telemetria (decodificadas con Nanopb), las muestra en la
// pantalla ILI9341 y, si ENVIAR_MENSAJE = true, manda UN mensaje de texto por
// broadcast al canal primario. Todo se imprime tambien por serial (115200).
//
// API de cliente Meshtastic (servicio, caracteristicas y secuencia de arranque):
//   https://meshtastic.org/docs/development/device/client-api/
// PIN de emparejamiento (FIXED_PIN por defecto = 123456 en equipos sin pantalla):
//   https://meshtastic.org/docs/configuration/radio/bluetooth/
// Telemetria al cliente conectado: DeviceMetrics cada minuto; ambiente (temperatura
// y luz del T1000-E) solo si environment_measurement_enabled:
//   https://meshtastic.org/docs/configuration/module/telemetry/
//
// Mensajes hacia el nodo (ToRadio): armados a mano en meshtastic_min.h y verificados
// con protoc (test/verificar.sh). Mensajes desde el nodo (FromRadio): Nanopb, en
// datos_tracker.cpp (test/verificar_decodificador.sh).

#include <NimBLEDevice.h>
#include <esp_random.h>
#include <atomic>
#include <stdarg.h>

#include "meshtastic_min.h"
#include "datos_tracker.h"
#include "pantalla.h"
#include "resultado_drenado.h"

// ===== CONFIGURACION =====
static const bool     ENVIAR_MENSAJE   = false;   // false = solo conectar y leer datos
static const bool     VOLCADO_CONFIG   = true;    // imprime cada FromRadio de la config inicial
static const char*    MENSAJE          = "prueba dinopad";
static const uint32_t PIN_BLE          = 123456;
static const char*    MAC_TEXTO        = "f0:d4:6c:51:a6:bb";   // T1000-E (G93_a6bb)
static const uint32_t ESCANEO_MAX_MS   = 15000;
static const uint32_t ESPERA_COLA_MS   = 15000;   // tiempo para ver el queueStatus del envio
static const uint32_t SONDEO_MS        = 10000;   // lectura de FromRadio aunque no avise FromNum
static const int      MAX_PAQUETES_CFG = 600;     // tope de lecturas al drenar FromRadio
// ===== DIAGNOSTICO DE ALIMENTACION (brownout al encender el BLE) =====
// Cada paso incluye a los anteriores:
//   '0' sin cambios
//   'A' esperar RETRASO_BLE_MS tras iniciar la pantalla antes de iniciar el BLE
//   'B' A + potencia de TX reducida: NimBLEDevice::setPower(dBm) (NimBLE-Arduino 2.x,
//       docs/1.x_to2.x_migration_guide.md: "only an integer value in dbm units")
//   'C' B + escaneo pasivo (setActiveScan(false)): no transmite peticiones de escaneo
//   'D' C + CPU a 80 MHz (ESP-IDF Power Management: con BT activo, CPU 80 / APB 80 MHz)
// El detector de brownout NO se desactiva.
#define PASO_DIAG '0'
static const uint32_t RETRASO_BLE_MS  = 3000;
static const int8_t   POTENCIA_TX_DBM = -12;   // minimo del ESP32 (ESP_PWR_LVL_N12)

// true = borra los emparejamientos guardados en el ESP32 al arrancar
// (usar si se cambia el PIN del T1000-E o si el emparejamiento quedo mal)
static const bool     BORRAR_BONDS     = false;

// UUIDs de https://meshtastic.org/docs/development/device/client-api/
static const NimBLEUUID UUID_SERVICIO ("6ba1b218-15a8-461f-9fa8-5dcae273eafd");
static const NimBLEUUID UUID_TORADIO  ("f75c76d2-129e-4dad-a1dd-7866124401e7");
static const NimBLEUUID UUID_FROMRADIO("2c55e69e-4993-11ed-b878-0242ac120002");
static const NimBLEUUID UUID_FROMNUM  ("ed9da18c-a800-4f66-a670-aa7547e34453");

// Nonces especiales del firmware (src/mesh/PhoneAPI.h); se evitan para
// pedir la configuracion normal documentada.
static const uint32_t SPECIAL_NONCE_ONLY_CONFIG = 69420;
static const uint32_t SPECIAL_NONCE_ONLY_NODES  = 69421;

// ===== ESTADO =====
static NimBLEAddress direccionObjetivo;
static char nombreObjetivo[32] = "";
static int rssiObjetivo = 0;
static volatile bool encontrado = false;
static volatile bool desconectado = false;
static std::atomic<uint32_t> avisosFromNum{0};
static uint8_t macObjetivo[6];

static NimBLEClient* cli = nullptr;
static NimBLERemoteCharacteristic* chToRadio = nullptr;
static NimBLERemoteCharacteristic* chFromRadio = nullptr;
static bool escuchando = false;          // pasos terminados: queda leyendo telemetria
static uint32_t ultimoSondeo = 0;
static uint32_t idEnviado = 0;           // mesh_packet_id del mensaje (del queueStatus)
static uint32_t routingVisto = 0;        // ultimo datos.routingContador revisado

static meshtastic_FromRadio fromRadio;   // 768 B: global, no en la pila
static DatosTracker datos;
static Estadisticas estadisticas;

// ---------- Utilidades ----------
static void logSerial(const char* fmt, ...) {
  char buf[256];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof buf, fmt, ap);
  va_end(ap);
  Serial.print(buf);
}

static void imprimirHex(const char* etiqueta, const uint8_t* d, size_t n) {
  Serial.printf("      %s (%u B):", etiqueta, (unsigned)n);
  for (size_t i = 0; i < n; i++) Serial.printf(" %02x", d[i]);
  Serial.println();
}

static void iniciarPaso(int n, const char* titulo) {
  Serial.printf("\n[%d/8] %s\n", n, titulo);
  pantalla::paso(n, EstadoPaso::EN_CURSO);
}

static void pasoOk(int n, const char* msg) {
  Serial.printf("      OK: %s\n", msg);
  pantalla::paso(n, EstadoPaso::OK);
}

static void detener(int paso, const char* motivo) {
  Serial.printf("\n[FALLO] paso [%d/8]: %s\n", paso, motivo);
  Serial.println("Detenido. Reinicia la placa (boton EN) para intentar de nuevo.");
  pantalla::paso(paso, EstadoPaso::ERROR);
  pantalla::estado(EstadoConexion::FALLO);
  pantalla::error(paso, motivo);
  while (true) delay(1000);
}

// ---------- Escaneo ----------
class CallbacksEscaneo : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* dev) override {
    if (encontrado) return;
    if (memcmp(dev->getAddress().getVal(), macObjetivo, 6) != 0) return;
    direccionObjetivo = dev->getAddress();
    strncpy(nombreObjetivo, dev->haveName() ? dev->getName().c_str() : "(sin nombre)",
            sizeof nombreObjetivo - 1);
    rssiObjetivo = dev->getRSSI();
    encontrado = true;
    Serial.printf("      encontrado: %s  %s  %d dBm  tipo_dir=%u  meshtastic=%s\n",
                  nombreObjetivo, dev->getAddress().toString().c_str(), rssiObjetivo,
                  dev->getAddress().getType(),
                  dev->isAdvertisingService(UUID_SERVICIO) ? "si" : "no");
  }
} callbacksEscaneo;

// ---------- Conexion y seguridad ----------
class CallbacksCliente : public NimBLEClientCallbacks {
  void onConnect(NimBLEClient* c) override {
    Serial.println("      (evento) conectado");
  }
  void onConnectFail(NimBLEClient* c, int reason) override {
    Serial.printf("      (evento) fallo al conectar, reason=%d\n", reason);
  }
  void onDisconnect(NimBLEClient* c, int reason) override {
    desconectado = true;
    Serial.printf("      (evento) desconectado, reason=%d\n", reason);
  }
  void onPassKeyEntry(NimBLEConnInfo& info) override {
    Serial.printf("      (evento) el T1000-E pide PIN -> enviando %06lu\n", (unsigned long)PIN_BLE);
    NimBLEDevice::injectPassKey(info, PIN_BLE);
  }
  void onConfirmPasskey(NimBLEConnInfo& info, uint32_t pin) override {
    // No deberia ocurrir con IO = solo teclado, pero se reporta por si acaso.
    Serial.printf("      (evento) comparacion numerica pedida (%06lu), se rechaza\n", (unsigned long)pin);
    NimBLEDevice::injectConfirmPasskey(info, false);
  }
  void onAuthenticationComplete(NimBLEConnInfo& info) override {
    Serial.printf("      (evento) autenticacion terminada: cifrado=%s autenticado=%s bonded=%s\n",
                  info.isEncrypted() ? "si" : "no",
                  info.isAuthenticated() ? "si" : "no",
                  info.isBonded() ? "si" : "no");
  }
  void onMTUChange(NimBLEClient* c, uint16_t mtu) override {
    Serial.printf("      (evento) MTU cambiado a %u\n", mtu);
  }
} callbacksCliente;

// ---------- FromRadio ----------
// Lee FromRadio hasta que regrese vacio (como indica la doc), decodifica cada
// mensaje con Nanopb y actualiza 'datos'.
static ResultadoDrenado drenarFromRadio(uint32_t nonce, bool volcado) {
  ResultadoDrenado r;
  while (r.paquetes < MAX_PAQUETES_CFG) {
    if (!cli->isConnected()) { r.error = true; return r; }
    time_t ts = (time_t)-1;   // NimBLE solo lo escribe si la lectura fue exitosa
    NimBLEAttValue v = chFromRadio->readValue(&ts);
    if (ts == (time_t)-1) {
      Serial.println("      ERROR: fallo la lectura de FromRadio");
      r.error = true;
      return r;
    }
    if (v.length() == 0) return r;   // vacio = no hay mas

    r.paquetes++;
    if (!decodificarFromRadio(v.data(), v.length(), &fromRadio)) {
      estadisticas.errores++;
      Serial.printf("      AVISO: FromRadio de %u B no se pudo decodificar\n", (unsigned)v.length());
      continue;
    }
    procesarFromRadio(fromRadio, datos, estadisticas, millis(), volcado ? logSerial : nullptr);

    if (fromRadio.which_payload_variant == meshtastic_FromRadio_config_complete_id_tag &&
        fromRadio.config_complete_id == nonce) {
      r.vioConfigComplete = true;
    }
    // El firmware informa el resultado de cada envio con un queueStatus que trae el
    // id del paquete (MeshService::sendToMesh). id 0 = estado general de la cola.
    if (fromRadio.which_payload_variant == meshtastic_FromRadio_queueStatus_tag &&
        fromRadio.queueStatus.mesh_packet_id != 0) {
      r.vioQueueStatus = true;
      r.qsRes = fromRadio.queueStatus.res;
      r.qsPacketId = fromRadio.queueStatus.mesh_packet_id;
    }
    if (!volcado && (r.paquetes % 25) == 0) Serial.printf("      ... %d paquetes leidos\n", r.paquetes);
    if (datos.cambio) { pantalla::datos(datos, millis()); datos.cambio = false; }
  }
  Serial.printf("      AVISO: se alcanzo el tope de %d lecturas sin ver FromRadio vacio\n", MAX_PAQUETES_CFG);
  return r;
}

// Si llego un Routing cuyo request_id es el id de nuestro mensaje, lo reporta.
// Para broadcast con want_ack: error_reason NONE = ACK implicito (alguien
// retransmitio el paquete); MAX_RETRANSMIT = nadie lo retransmitio tras los reintentos.
static void revisarRoutingDelEnvio() {
  if (!idEnviado || datos.routingContador == routingVisto) return;
  routingVisto = datos.routingContador;
  if (datos.routingRequestId != idEnviado) return;
  bool ok = datos.routingError == meshtastic_Routing_Error_NONE;
  char t[64];
  snprintf(t, sizeof t, "%s: %s (de !%08lx)", ok ? "ACK" : "NAK",
           meshtastic_Routing_Error_name((meshtastic_Routing_Error)datos.routingError),
           (unsigned long)datos.routingFrom);
  Serial.printf("\n[ROUTING] para mesh_packet_id=%lu -> %s\n", (unsigned long)idEnviado, t);
  pantalla::ackEnvio(t, ok);
}

static bool escribirToRadio(const uint8_t* d, size_t n) {
  return chToRadio->writeValue(d, n, true);   // con respuesta: confirma que el nodo la recibio
}

void setup() {
#if PASO_DIAG >= 'D' && PASO_DIAG <= 'D'
  setCpuFrequencyMhz(80);
#endif
  Serial.begin(115200);
  delay(500);
  Serial.printf("\nDIAG paso %c: CPU %lu MHz\n", PASO_DIAG, (unsigned long)getCpuFrequencyMhz());
  Serial.println("\n===== ble_send: ESP32 -> T1000-E (Meshtastic) =====");
  if (ENVIAR_MENSAJE) Serial.printf("Mensaje: \"%s\"  destino: broadcast, canal primario\n", MENSAJE);
  else Serial.println("ENVIAR_MENSAJE = false: solo se leen datos, no se envia nada");

  pantalla::iniciar(MAC_TEXTO);
  pantalla::estado(EstadoConexion::BUSCANDO);
  if (!ENVIAR_MENSAJE) {
    pantalla::paso(7, EstadoPaso::OMITIDO);
    pantalla::paso(8, EstadoPaso::OMITIDO);
  }

  NimBLEAddress tmp(std::string(MAC_TEXTO), BLE_ADDR_PUBLIC);
  memcpy(macObjetivo, tmp.getVal(), 6);

#if PASO_DIAG >= 'A' && PASO_DIAG <= 'D'
  Serial.printf("DIAG: esperando %lu ms antes de iniciar el BLE\n", (unsigned long)RETRASO_BLE_MS);
  delay(RETRASO_BLE_MS);
#endif
  Serial.println("DIAG: iniciando BLE (NimBLEDevice::init)");
  NimBLEDevice::init("dinopad");
  Serial.println("DIAG: BLE iniciado");
#if PASO_DIAG >= 'B' && PASO_DIAG <= 'D'
  bool okPot = NimBLEDevice::setPower(POTENCIA_TX_DBM);
  Serial.printf("DIAG: setPower(%d dBm) %s -> getPower()=%d dBm\n", POTENCIA_TX_DBM,
                okPot ? "ok" : "FALLO", NimBLEDevice::getPower());
#endif
  NimBLEDevice::setMTU(512);                                // la doc recomienda MTU 512
  NimBLEDevice::setSecurityAuth(true, true, true);          // bonding, MITM, secure connections
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_KEYBOARD_ONLY);  // el ESP32 "teclea" el PIN
  if (BORRAR_BONDS) {
    Serial.printf("Borrando emparejamientos guardados: %s\n",
                  NimBLEDevice::deleteAllBonds() ? "ok" : "fallo");
  }

  // [1] Escaneo
  char msg[96];
  snprintf(msg, sizeof msg, "Buscando %s (max %lu s)...", MAC_TEXTO, (unsigned long)(ESCANEO_MAX_MS / 1000));
  iniciarPaso(1, msg);
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setScanCallbacks(&callbacksEscaneo, false);
#if PASO_DIAG >= 'C' && PASO_DIAG <= 'D'
  scan->setActiveScan(false);   // pasivo: el nombre puede no llegar, se busca por MAC
  Serial.println("DIAG: escaneo pasivo");
#else
  scan->setActiveScan(true);
#endif
  scan->setInterval(100);
  scan->setWindow(99);
  scan->setMaxResults(0);   // no guardar resultados (hay cientos de anuncios alrededor)
  scan->start(ESCANEO_MAX_MS, false, true);
  uint32_t t0 = millis();
  while (!encontrado && millis() - t0 < ESCANEO_MAX_MS + 500) delay(20);
  scan->stop();
  if (!encontrado) detener(1, "no se encontro el T1000-E. Esta encendido y sin otro cliente conectado?");
  pantalla::nombreTracker(nombreObjetivo, rssiObjetivo);
  pasoOk(1, "tracker encontrado");

  // [2] Conexion
  pantalla::estado(EstadoConexion::CONECTANDO);
  iniciarPaso(2, "Conectando...");
  cli = NimBLEDevice::createClient();
  cli->setClientCallbacks(&callbacksCliente, false);
  cli->setConnectTimeout(10000);
  if (!cli->connect(direccionObjetivo, true, false, true)) {
    detener(2, "no se pudo conectar (otro cliente conectado? fuera de alcance?)");
  }
  pasoOk(2, "conectado");

  // [3] Emparejamiento con PIN
  iniciarPaso(3, "Emparejando / cifrando el enlace...");
  bool seguro = cli->secureConnection();   // bloquea hasta terminar
  NimBLEConnInfo info = cli->getConnInfo();
  Serial.printf("      cifrado=%s autenticado=%s bonded=%s\n",
                info.isEncrypted() ? "si" : "no",
                info.isAuthenticated() ? "si" : "no",
                info.isBonded() ? "si" : "no");
  if (!seguro || !info.isEncrypted()) {
    detener(3, "emparejamiento fallido. PIN incorrecto? Si cambiaste el PIN usa BORRAR_BONDS=true");
  }
  pantalla::estado(EstadoConexion::EMPAREJADO);
  pasoOk(3, "emparejado");

  // [4] MTU
  iniciarPaso(4, "MTU");
  uint16_t mtu = cli->getMTU();
  Serial.printf("      MTU negociado: %u (pedido: 512)\n", mtu);
  if (mtu < 32) detener(4, "MTU muy chico");
  snprintf(msg, sizeof msg, "MTU %u", mtu);
  pasoOk(4, msg);

  // [5] Servicio y caracteristicas
  iniciarPaso(5, "Buscando servicio y caracteristicas de Meshtastic...");
  NimBLERemoteService* svc = cli->getService(UUID_SERVICIO);
  if (!svc) detener(5, "el dispositivo no tiene el servicio de Meshtastic");
  chToRadio = svc->getCharacteristic(UUID_TORADIO);
  chFromRadio = svc->getCharacteristic(UUID_FROMRADIO);
  NimBLERemoteCharacteristic* chFromNum = svc->getCharacteristic(UUID_FROMNUM);
  Serial.printf("      ToRadio:%s  FromRadio:%s  FromNum:%s\n",
                chToRadio ? "ok" : "FALTA", chFromRadio ? "ok" : "FALTA", chFromNum ? "ok" : "FALTA");
  if (!chToRadio || !chFromRadio || !chFromNum) detener(5, "faltan caracteristicas ToRadio/FromRadio/FromNum");
  if (chFromNum->canNotify() &&
      chFromNum->subscribe(true, [](NimBLERemoteCharacteristic*, uint8_t*, size_t, bool) { avisosFromNum++; })) {
    Serial.println("      suscrito a notificaciones de FromNum");
  } else {
    Serial.println("      AVISO: no se pudo suscribir a FromNum; se leera FromRadio por sondeo");
  }
  pasoOk(5, "servicio y caracteristicas");

  // [6] want_config_id y drenar FromRadio
  uint32_t nonce;
  do { nonce = esp_random(); } while (nonce == 0 || nonce == SPECIAL_NONCE_ONLY_CONFIG ||
                                      nonce == SPECIAL_NONCE_ONLY_NODES);
  uint8_t buf[300];
  size_t n = mt::encodeWantConfig(buf, sizeof buf, nonce);
  snprintf(msg, sizeof msg, "Escribiendo want_config_id=%lu en ToRadio", (unsigned long)nonce);
  iniciarPaso(6, msg);
  imprimirHex("ToRadio", buf, n);
  if (!n || !escribirToRadio(buf, n)) detener(6, "fallo la escritura de want_config_id en ToRadio");
  Serial.println("      escritura en ToRadio OK");
  Serial.println("      Leyendo FromRadio hasta vacio (configuracion y base de nodos)...");
  ResultadoDrenado r = drenarFromRadio(nonce, VOLCADO_CONFIG);
  if (r.error) detener(6, "se perdio la conexion o fallo una lectura de FromRadio");
  Serial.printf("      FromRadio vacio tras %d paquete(s)%s\n", r.paquetes,
                r.vioConfigComplete ? ", configuracion completa" : " (no se vio config_complete_id)");
  imprimirResumen(estadisticas, datos, logSerial);
  pantalla::datos(datos, millis());
  datos.cambio = false;
  snprintf(msg, sizeof msg, "FromRadio vacio tras %d paquetes", r.paquetes);
  pasoOk(6, msg);

  if (ENVIAR_MENSAJE) {
    // [7] Mensaje de texto
    n = mt::encodeTextPacket(buf, sizeof buf, MENSAJE);
    if (!n) detener(7, "el mensaje no cabe (max 233 bytes de texto)");
    if (n > (size_t)(mtu - 3)) detener(7, "el mensaje no cabe en el MTU negociado");
    iniciarPaso(7, "Escribiendo mensaje de texto en ToRadio");
    imprimirHex("ToRadio", buf, n);
    avisosFromNum = 0;
    if (!escribirToRadio(buf, n)) detener(7, "fallo la escritura del mensaje en ToRadio");
    pasoOk(7, "escritura en ToRadio (el T1000-E recibio el paquete)");
    pantalla::enviado(MENSAJE, false);

    // [8] Respuesta del nodo
    snprintf(msg, sizeof msg, "Esperando respuesta del nodo (%lu s)...", (unsigned long)(ESPERA_COLA_MS / 1000));
    iniciarPaso(8, msg);
    t0 = millis();
    uint32_t sondeo = 0;
    bool vioQs = false;
    int32_t res = 0;
    while (millis() - t0 < ESPERA_COLA_MS && cli->isConnected() && !vioQs) {
      if (avisosFromNum > 0 || millis() - sondeo > 2000) {
        if (avisosFromNum > 0) Serial.printf("      FromNum notifico (%lu)\n", (unsigned long)avisosFromNum.load());
        avisosFromNum = 0;
        sondeo = millis();
        ResultadoDrenado rr = drenarFromRadio(nonce, true);
        if (rr.error) break;
        if (rr.vioQueueStatus) { vioQs = true; res = rr.qsRes; idEnviado = rr.qsPacketId; }
      }
      delay(50);
    }
    if (!cli->isConnected()) detener(8, "se perdio la conexion esperando la respuesta");
    if (vioQs && res != 0) {
      snprintf(msg, sizeof msg, "el nodo rechazo el envio: queueStatus res=%ld", (long)res);
      detener(8, msg);
    }
    if (vioQs) {
      snprintf(msg, sizeof msg, "queueStatus res=0: aceptado en la cola (mesh_packet_id=%lu)",
               (unsigned long)idEnviado);
      pasoOk(8, msg);
      pantalla::enviado(MENSAJE, true);
      pantalla::ackEnvio("esperando ACK/NAK del envio...", true);
      Serial.println("      Se seguira esperando el Routing (ACK implicito o NAK) de ese id.");
    } else {
      Serial.println("      AVISO: no llego queueStatus del envio en el tiempo de espera");
      pantalla::paso(8, EstadoPaso::OK);
    }
  } else {
    Serial.println("\n[7/8] y [8/8] omitidos (ENVIAR_MENSAJE = false)");
    pantalla::aviso("Conectado. Leyendo datos del tracker (no se envia mensaje). "
                    "DeviceMetrics llegan cada ~1 min.");
  }

  // Queda conectado leyendo telemetria (DeviceMetrics llegan cada minuto)
  pantalla::estado(EstadoConexion::CONECTADO);
  Serial.println("\n===== Pasos terminados. Conectado, escuchando FromRadio (telemetria). =====");
  escuchando = true;
  ultimoSondeo = millis();
}

void loop() {
  if (!escuchando) { delay(100); return; }

  if (desconectado || !cli->isConnected()) {
    escuchando = false;
    Serial.println("\n[DESCONECTADO] se perdio la conexion con el T1000-E. Reinicia para reconectar.");
    pantalla::estado(EstadoConexion::DESCONECTADO);
    pantalla::error(0, "Conexion BLE perdida con el tracker. Reinicia la placa (EN) para reconectar.");
    return;
  }

  if (avisosFromNum > 0 || millis() - ultimoSondeo > SONDEO_MS) {
    avisosFromNum = 0;
    ultimoSondeo = millis();
    drenarFromRadio(0, true);   // imprime cada mensaje en vivo
  }
  revisarRoutingDelEnvio();
  pantalla::datos(datos, millis());   // actualiza tambien la "edad" de los datos
  datos.cambio = false;
  delay(50);
}
