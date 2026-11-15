// red_mqtt.cpp - ver red_mqtt.h
#include "red_mqtt.h"

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <sys/time.h>
#include <time.h>

#include "compartido.h"

#if __has_include("secretos.h")
#include "secretos.h"
#include "ca_raiz.h"
#define RED_ACTIVA 1
#else
#define RED_ACTIVA 0
#endif

const char* nombreEstadoRed(EstadoRed e) {
  switch (e) {
    case EstadoRed::APAGADA: return "APAGADA";
    case EstadoRed::WIFI: return "WIFI";
    case EstadoRed::HORA: return "HORA";
    case EstadoRed::BROKER: return "BROKER";
    case EstadoRed::CONECTADA: return "CONECTADA";
  }
  return "?";
}

static volatile EstadoRed estado_ = EstadoRed::APAGADA;
static char detalle_[64] = "sin secretos.h: red apagada";

EstadoRed redEstado() { return estado_; }
const char* redDetalle() { return detalle_; }

#if !RED_ACTIVA
void redIniciar() { Serial.println("RED: sin secretos.h -> apagada (ver secretos.ejemplo.h)"); }
void redEnviarVital(const MuestraVital&) {}
void redEnviarUi(int, Modo, const char*, bool) {}
void redEnviarSos() {}
#else

enum Tema : uint8_t { T_VITALS, T_ALERTAS, T_ESTADO, T_UI };
static const char* const TEMAS[] = {"dinopad/vitals", "dinopad/alertas", "dinopad/estado", "dinopad/ui"};

struct Mensaje {
  uint8_t tema;
  char json[240];
};

static const uint32_t ESTADO_CADA_MS = 30000;   // telemetria del tracker
static const uint32_t UI_LATIDO_MS = 15000;     // el espejo se resincroniza aunque no haya botones
static const uint32_t REINTENTO_BROKER_MS = 5000;
static const uint32_t REINTENTO_WIFI_MS = 20000;

static QueueHandle_t cola_ = nullptr;
static volatile bool sosPendiente_ = false;
static volatile uint64_t sosTs_ = 0;
static char deviceId_[24] = "dinopad";

// Ultimo estado del menu, para el latido del espejo
static portMUX_TYPE muxUi_ = portMUX_INITIALIZER_UNLOCKED;
static int uiPestana_ = 0;
static Modo uiModo_ = Modo::MENU;
static char uiEvento_[40] = "inicio";
static bool uiDemo_ = false;

static WiFiClientSecure tls_;
static PubSubClient mqtt_(tls_);
static Compartido copiaRed_;   // ~1 KB: global, no en la pila de la tarea

static void ponerEstado(EstadoRed e, const char* det) {
  if (estado_ != e || strcmp(detalle_, det) != 0) {
    estado_ = e;
    snprintf(detalle_, sizeof detalle_, "%s", det);
    Serial.printf("RED: %s (%s)\n", nombreEstadoRed(e), detalle_);
  }
}

// Hora real en ms (NTP). 0 = todavia no hay hora; el backend pone la suya.
static uint64_t epochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}

static void encolar(uint8_t tema, const char* json) {
  if (!cola_) return;
  Mensaje m;
  m.tema = tema;
  snprintf(m.json, sizeof m.json, "%s", json);
  if (xQueueSend(cola_, &m, 0) != pdTRUE) {   // llena: tirar la mas vieja y reintentar
    Mensaje vieja;
    xQueueReceive(cola_, &vieja, 0);
    xQueueSend(cola_, &m, 0);
  }
}

void redEnviarVital(const MuestraVital& mv) {
  char j[240];
  uint64_t ts = epochMs();
  // Valores del SIMULADOR del ESP32 (simulador_vital.h): source "simulated" -> la web dice DEMO
  snprintf(j, sizeof j,
           "{\"crewId\":\"%s\",\"indicatorId\":\"hr\",\"value\":%u,\"unit\":\"lpm\",\"timestamp\":%llu,"
           "\"source\":\"simulated\",\"quality\":\"ok\"}",
           CREW_ID, mv.hr, (unsigned long long)ts);
  encolar(T_VITALS, j);
  snprintf(j, sizeof j,
           "{\"crewId\":\"%s\",\"indicatorId\":\"spo2\",\"value\":%u,\"unit\":\"%%\",\"timestamp\":%llu,"
           "\"source\":\"simulated\",\"quality\":\"ok\"}",
           CREW_ID, mv.spo2, (unsigned long long)ts);
  encolar(T_VITALS, j);
}

static const char* nombreModoRed(Modo m) {
  return m == Modo::MENU ? "MENU" : m == Modo::DENTRO ? "DENTRO" : "SOS";
}

static void publicarUiActual(uint8_t destino_tema) {
  int p; Modo mo; char ev[40]; bool demo;
  portENTER_CRITICAL(&muxUi_);
  p = uiPestana_; mo = uiModo_; snprintf(ev, sizeof ev, "%s", uiEvento_); demo = uiDemo_;
  portEXIT_CRITICAL(&muxUi_);
  char j[240];
  snprintf(j, sizeof j,
           "{\"type\":\"ui\",\"crewId\":\"%s\",\"deviceId\":\"%s\",\"tab\":%d,\"tabName\":\"%s\","
           "\"mode\":\"%s\",\"event\":\"%s\",\"demo\":%s,\"timestamp\":%llu,\"source\":\"live\"}",
           CREW_ID, deviceId_, p, NOMBRES_PESTANA[p], nombreModoRed(mo), ev, demo ? "true" : "false",
           (unsigned long long)epochMs());
  encolar(destino_tema, j);
}

void redEnviarUi(int pestana, Modo modo, const char* evento, bool desdeDemo) {
  portENTER_CRITICAL(&muxUi_);
  uiPestana_ = pestana; uiModo_ = modo; uiDemo_ = desdeDemo;
  snprintf(uiEvento_, sizeof uiEvento_, "%s", evento ? evento : "");
  portEXIT_CRITICAL(&muxUi_);
  publicarUiActual(T_UI);
}

void redEnviarSos() {
  sosTs_ = epochMs();
  sosPendiente_ = true;   // la tarea lo publica en cuanto haya broker; no compite con la cola
}

// Telemetria REAL del T1000-E (lo que la tarea BLE decodifico). Sin bateria todavia no se manda:
// el contrato (DeviceStatus) la exige.
static bool armarEstado(char* j, size_t n) {
  compartidoCopiar(copiaRed_);
  const DatosTracker& d = copiaRed_.datos;
  if (!d.tieneBateria) return false;
  bool usb = d.bateria > 100;   // 101 = alimentado por USB (firmware Meshtastic)
  int pos = snprintf(j, n,
      "{\"deviceId\":\"%s\",\"crewId\":\"%s\",\"status\":\"%s\",\"batteryPct\":%u,\"rssi\":%d,"
      "\"timestamp\":%llu,\"source\":\"live\",\"power\":\"%s\",\"ble\":\"%s\"",
      deviceId_, CREW_ID, nombreEstadoBle(copiaRed_.estado), usb ? 100u : (unsigned)d.bateria,
      copiaRed_.tieneRssi ? copiaRed_.rssi : 0, (unsigned long long)epochMs(), usb ? "usb" : "battery",
      nombreEstadoBle(copiaRed_.estado));
  if (d.tieneVoltaje) pos += snprintf(j + pos, n - pos, ",\"voltage\":%.2f", d.voltaje);
  if (d.tieneUsoCanal) pos += snprintf(j + pos, n - pos, ",\"channelUtil\":%.1f", d.usoCanal);
  if (d.tieneAirTx) pos += snprintf(j + pos, n - pos, ",\"airTx\":%.1f", d.airTx);
  if (d.tieneUptime) pos += snprintf(j + pos, n - pos, ",\"uptimeS\":%lu", (unsigned long)d.uptime);
  if (d.tieneTemperatura) pos += snprintf(j + pos, n - pos, ",\"ambientTempC\":%.1f", d.temperatura);
  if (d.tieneLuz) pos += snprintf(j + pos, n - pos, ",\"lightPct\":%.0f", d.luz);
  pos += snprintf(j + pos, n - pos, ",\"stale\":%s,\"wifiRssi\":%d}", d.metricasGuardadas ? "true" : "false",
                  (int)WiFi.RSSI());
  return pos > 0 && (size_t)pos < n;
}

static void tareaRed(void*) {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(true);   // obligatorio con BLE activo (coexistencia de la radio)
  if (strlen(WIFI_PASS) == 0) WiFi.begin(WIFI_SSID);
  else WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t inicioWifi = millis(), ultimoBroker = 0, ultimoEstado = 0, ultimoLatido = 0;
  bool ntpPedido = false;
  char j[400];

  tls_.setCACert(CA_RAIZ);
  tls_.setHandshakeTimeout(12);
  mqtt_.setServer(MQTT_HOST, MQTT_PORT);
  mqtt_.setBufferSize(512);
  mqtt_.setKeepAlive(30);
  mqtt_.setSocketTimeout(8);

  for (;;) {
    uint32_t ahora = millis();
    if (WiFi.status() != WL_CONNECTED) {
      ponerEstado(EstadoRed::WIFI, "buscando " WIFI_SSID);
      if (ahora - inicioWifi > REINTENTO_WIFI_MS) {
        WiFi.disconnect();
        if (strlen(WIFI_PASS) == 0) WiFi.begin(WIFI_SSID);
        else WiFi.begin(WIFI_SSID, WIFI_PASS);
        inicioWifi = ahora;
      }
      vTaskDelay(pdMS_TO_TICKS(250));
      continue;
    }
    if (!ntpPedido) {
      configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
      ntpPedido = true;
    }
    if (epochMs() == 0) {
      ponerEstado(EstadoRed::HORA, WiFi.localIP().toString().c_str());
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    if (!mqtt_.connected()) {
      if (estado_ == EstadoRed::CONECTADA) ponerEstado(EstadoRed::BROKER, "se perdio el broker");
      else if (estado_ != EstadoRed::BROKER) ponerEstado(EstadoRed::BROKER, MQTT_HOST);
      if (ahora - ultimoBroker >= REINTENTO_BROKER_MS) {
        ultimoBroker = ahora;
        if (mqtt_.connect(deviceId_, MQTT_USER, MQTT_PASS)) {
          ponerEstado(EstadoRed::CONECTADA, MQTT_HOST);
          ultimoEstado = 0;
          ultimoLatido = 0;
        } else {
          char det[64];
          snprintf(det, sizeof det, "broker rechazo o no responde (rc=%d)", mqtt_.state());
          ponerEstado(EstadoRed::BROKER, det);
        }
      }
      vTaskDelay(pdMS_TO_TICKS(200));
      continue;
    }

    mqtt_.loop();
    if (sosPendiente_) {
      snprintf(j, sizeof j, "{\"crewId\":\"%s\",\"type\":\"sos\",\"timestamp\":%llu}", CREW_ID,
               (unsigned long long)(sosTs_ ? sosTs_ : epochMs()));
      if (mqtt_.publish(TEMAS[T_ALERTAS], j)) {
        sosPendiente_ = false;
        Serial.println("RED: SOS publicado en dinopad/alertas");
      }
    }
    Mensaje m;
    for (int k = 0; k < 8 && xQueueReceive(cola_, &m, 0) == pdTRUE; k++) mqtt_.publish(TEMAS[m.tema], m.json);
    if (ultimoEstado == 0 || ahora - ultimoEstado >= ESTADO_CADA_MS) {
      ultimoEstado = ahora;
      if (armarEstado(j, sizeof j)) mqtt_.publish(TEMAS[T_ESTADO], j);
    }
    if (ultimoLatido == 0 || ahora - ultimoLatido >= UI_LATIDO_MS) {
      ultimoLatido = ahora;
      publicarUiActual(T_UI);
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void redIniciar() {
  uint64_t mac = ESP.getEfuseMac();   // MAC de fabrica (no depende de que el Wi-Fi ya arranco)
  snprintf(deviceId_, sizeof deviceId_, "dinopad-%02x%02x", (unsigned)((mac >> 32) & 0xff), (unsigned)((mac >> 40) & 0xff));
  cola_ = xQueueCreate(12, sizeof(Mensaje));
  Serial.printf("RED: %s -> %s:%d como %s (%s)\n", WIFI_SSID, MQTT_HOST, MQTT_PORT, deviceId_, CREW_ID);
  // Nucleo 1 (el BLE va en el 0), misma prioridad que loop(): se reparten el tiempo.
  xTaskCreatePinnedToCore(tareaRed, "red", 10240, nullptr, 1, nullptr, 1);
}
#endif
