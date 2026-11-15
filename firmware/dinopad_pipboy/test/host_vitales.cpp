// Prueba en la PC de vitales.h, simulador_vital.h y mensajes.h. Uso: test/verificar_vitales.sh
#include <cstdio>
#include <cstring>

#include "../mensajes.h"
#include "../simulador_vital.h"
#include "../vitales.h"

static int fallos = 0;
static void revisar(const char* caso, bool ok) {
  if (!ok) fallos++;
  printf("%-4s %s\n", ok ? "OK" : "FALLA", caso);
}

int main() {
  // Semaforo con los bordes de backend/data/crew.json
  revisar("hr 50 y 90 normal", clasificar(50, RANGO_HR) == Semaforo::NORMAL && clasificar(90, RANGO_HR) == Semaforo::NORMAL);
  revisar("hr 91 y 110 atencion", clasificar(91, RANGO_HR) == Semaforo::ATENCION && clasificar(110, RANGO_HR) == Semaforo::ATENCION);
  revisar("hr 49 y 40 atencion", clasificar(49, RANGO_HR) == Semaforo::ATENCION && clasificar(40, RANGO_HR) == Semaforo::ATENCION);
  revisar("hr 111 y 39 critico", clasificar(111, RANGO_HR) == Semaforo::CRITICO && clasificar(39, RANGO_HR) == Semaforo::CRITICO);
  revisar("spo2 95 normal, 94 y 90 atencion", clasificar(95, RANGO_SPO2) == Semaforo::NORMAL &&
                                                  clasificar(94, RANGO_SPO2) == Semaforo::ATENCION &&
                                                  clasificar(90, RANGO_SPO2) == Semaforo::ATENCION);
  revisar("spo2 89 critico (como el 84 % del simulador del backend)", clasificar(89, RANGO_SPO2) == Semaforo::CRITICO);

  // Simulador: una muestra cada 2 s, nunca critico, y con fase de esfuerzo visible
  SimuladorVital sim;
  HistorialVital h;
  MuestraVital m;
  int muestras = 0, criticas = 0, atencion = 0;
  bool periodoOk = true;
  uint32_t anterior = 0;
  for (uint32_t ms = 0; ms <= 10u * 60u * 1000u; ms += 100) {
    if (!sim.leer(ms, m)) continue;
    if (muestras && m.ms - anterior != SimuladorVital::PERIODO_MS) periodoOk = false;
    anterior = m.ms;
    muestras++;
    h.agregar(m);
    if (clasificar(m.hr, RANGO_HR) == Semaforo::CRITICO || clasificar(m.spo2, RANGO_SPO2) == Semaforo::CRITICO) criticas++;
    if (clasificar(m.hr, RANGO_HR) == Semaforo::ATENCION || clasificar(m.spo2, RANGO_SPO2) == Semaforo::ATENCION) atencion++;
  }
  revisar("simulador: 301 muestras en 10 min, cada 2 s", muestras == 301 && periodoOk);
  revisar("simulador: nunca critico", criticas == 0);
  revisar("simulador: el esfuerzo pone el semaforo en ATENCION", atencion > 0);
  printf("     (de %d muestras, %d en atencion)\n", muestras, atencion);
  revisar("historial: se queda con las ultimas 60", h.cantidad() == HistorialVital::N && h.ultima()->ms == 600000);

  // Mensajes predeterminados
  bool cortos = true, ascii = true;
  for (int i = 0; i < N_MENSAJES; i++) {
    const char* s = MENSAJES_PREDETERMINADOS[i];
    if (strlen(s) == 0 || strlen(s) > (size_t)MAX_CHARS_MENSAJE) cortos = false;
    for (const char* c = s; *c; c++)
      if ((unsigned char)*c < 32 || (unsigned char)*c > 126) ascii = false;
  }
  revisar("mensajes: 1 a 24 caracteres (caben en una fila)", cortos);
  revisar("mensajes: solo ASCII (la fuente no tiene acentos)", ascii);
  revisar("mensajes: 8 caben en la pestana", N_MENSAJES <= 8);

  printf("\n%s\n", fallos ? "HAY FALLOS" : "TODO OK");
  return fallos ? 1 : 0;
}
