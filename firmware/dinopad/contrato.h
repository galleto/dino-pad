// contrato.h - Mensajes MQTT del DINO PAD segun docs/contrato-datos.md.
// C++ puro (sin Arduino) para validarlo en la PC contra los modelos del backend
// (backend/models.py): test/verificar_contrato.sh.
//
// Topicos y QoS:
//   dinopad/vitals   VitalReading   (una lectura por mensaje)        QoS 0
//   dinopad/alertas  AlertMessage   (sos / ping)                     QoS 1, sin retain
//   dinopad/estado   DeviceStatus                                     QoS 0
// Ningun mensaje usa retain (un SOS viejo no debe reenviarse al reconectar).
// timestamp: epoch en milisegundos de cuando se midio / se presiono.
#pragma once
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

namespace contrato {

static const char* const TOPICO_VITALS  = "dinopad/vitals";
static const char* const TOPICO_ALERTAS = "dinopad/alertas";
static const char* const TOPICO_ESTADO  = "dinopad/estado";

static const int QOS_VITALS  = 0;
static const int QOS_ALERTAS = 1;
static const int QOS_ESTADO  = 0;
static const int RETAIN      = 0;

// Valores permitidos por backend/models.py
static const char* const SOURCE_LIVE      = "live";
static const char* const SOURCE_SIMULATED = "simulated";
static const char* const QUALITY_OK        = "ok";
static const char* const QUALITY_NO_SIGNAL = "no_signal";

inline bool batteryValida(int pct) { return pct >= 0 && pct <= 100; }

// dinopad/vitals. Si !tieneValor, value = null y quality debe ser "no_signal".
inline size_t lecturaVital(char* out, size_t cap, const char* crewId, const char* indicatorId,
                           bool tieneValor, int valor, const char* unit, uint64_t tsMs,
                           const char* source, const char* quality) {
  char v[16];
  if (tieneValor) snprintf(v, sizeof v, "%d", valor);
  else snprintf(v, sizeof v, "null");
  int n = snprintf(out, cap,
                   "{\"crewId\":\"%s\",\"indicatorId\":\"%s\",\"value\":%s,\"unit\":\"%s\","
                   "\"timestamp\":%llu,\"source\":\"%s\",\"quality\":\"%s\"}",
                   crewId, indicatorId, v, unit, (unsigned long long)tsMs, source, quality);
  return (n > 0 && (size_t)n < cap) ? (size_t)n : 0;
}

// dinopad/alertas. tipo: "sos" o "ping".
inline size_t alerta(char* out, size_t cap, const char* crewId, const char* tipo, uint64_t tsMs) {
  if (strcmp(tipo, "sos") != 0 && strcmp(tipo, "ping") != 0) return 0;
  int n = snprintf(out, cap, "{\"crewId\":\"%s\",\"type\":\"%s\",\"timestamp\":%llu}", crewId, tipo,
                   (unsigned long long)tsMs);
  return (n > 0 && (size_t)n < cap) ? (size_t)n : 0;
}

// dinopad/estado. batteryPct debe estar en 0..100 (el modelo lo exige); si no, devuelve 0.
inline size_t estado(char* out, size_t cap, const char* deviceId, const char* crewId, const char* status,
                     int batteryPct, int rssi, uint64_t tsMs) {
  if (!batteryValida(batteryPct)) return 0;
  int n = snprintf(out, cap,
                   "{\"deviceId\":\"%s\",\"crewId\":\"%s\",\"status\":\"%s\",\"batteryPct\":%d,"
                   "\"rssi\":%d,\"timestamp\":%llu}",
                   deviceId, crewId, status, batteryPct, rssi, (unsigned long long)tsMs);
  return (n > 0 && (size_t)n < cap) ? (size_t)n : 0;
}

}  // namespace contrato
