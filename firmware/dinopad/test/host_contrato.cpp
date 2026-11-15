// Genera los mensajes de contrato.h ("topico<TAB>json" por linea) para que
// validar_contrato.py los valide contra backend/models.py. Tambien revisa los
// casos que el constructor debe rechazar. Uso: test/verificar_contrato.sh
#include <cstdio>

#include "../contrato.h"

using namespace contrato;

static int fallos = 0;
static char buf[256];

static void emitir(const char* topico, size_t n) {
  if (!n) { printf("ERROR-CONSTRUCCION\t%s\n", topico); fallos++; return; }
  printf("%s\t%s\n", topico, buf);
}

static void rechaza(const char* caso, size_t n) {
  if (n) { fprintf(stderr, "FALLA debia rechazar: %s -> %s\n", caso, buf); fallos++; }
  else fprintf(stderr, "OK   rechaza: %s\n", caso);
}

int main() {
  const uint64_t ts = 1794700000123ULL;
  // Lo que publica el firmware al presionar BLANCO (simulado hasta el MAX30102)
  emitir(TOPICO_VITALS, lecturaVital(buf, sizeof buf, "comandante", "hr", true, 72, "lpm", ts, SOURCE_SIMULATED, QUALITY_OK));
  emitir(TOPICO_VITALS, lecturaVital(buf, sizeof buf, "comandante", "spo2", true, 98, "%", ts, SOURCE_SIMULATED, QUALITY_OK));
  // Lectura sin senal (value null) y lectura real
  emitir(TOPICO_VITALS, lecturaVital(buf, sizeof buf, "botanico", "hr", false, 0, "lpm", ts, SOURCE_SIMULATED, QUALITY_NO_SIGNAL));
  emitir(TOPICO_VITALS, lecturaVital(buf, sizeof buf, "ingeniero", "spo2", true, 95, "%", ts, SOURCE_LIVE, QUALITY_OK));
  // NEGRO y ROJO
  emitir(TOPICO_ALERTAS, alerta(buf, sizeof buf, "comandante", "ping", ts));
  emitir(TOPICO_ALERTAS, alerta(buf, sizeof buf, "comandante", "sos", ts));
  // SOS sin hora NTP (timestamp 0): debe seguir siendo valido para el backend
  emitir(TOPICO_ALERTAS, alerta(buf, sizeof buf, "comandante", "sos", 0));
  // Estado: bordes de bateria
  emitir(TOPICO_ESTADO, estado(buf, sizeof buf, "dinopad-01", "comandante", "online", 0, -90, ts));
  emitir(TOPICO_ESTADO, estado(buf, sizeof buf, "dinopad-01", "comandante", "online", 100, -40, ts));

  // Casos que el constructor debe rechazar (no deben llegar al broker)
  rechaza("bateria 101", estado(buf, sizeof buf, "dinopad-01", "comandante", "online", 101, -50, ts));
  rechaza("bateria -1 (sin sensor)", estado(buf, sizeof buf, "dinopad-01", "comandante", "online", -1, -50, ts));
  rechaza("tipo de alerta desconocido", alerta(buf, sizeof buf, "comandante", "auxilio", ts));
  rechaza("buffer chico", alerta(buf, 10, "comandante", "sos", ts));

  // QoS y retain que pide el contrato
  if (QOS_ALERTAS != 1 || RETAIN != 0) { fprintf(stderr, "FALLA QoS de alertas debe ser 1 y sin retain\n"); fallos++; }
  else fprintf(stderr, "OK   alertas con QoS 1 y sin retain\n");

  return fallos ? 1 : 0;
}
