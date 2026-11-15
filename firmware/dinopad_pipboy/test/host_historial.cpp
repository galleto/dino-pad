// Prueba en la PC de historial.h. Uso: test/verificar_historial.sh
#include <cstdio>

#include "../historial.h"

static int fallos = 0;
static void revisar(const char* caso, bool ok) {
  if (!ok) fallos++;
  printf("%-4s %s\n", ok ? "OK" : "FALLA", caso);
}

static MuestraAmbiente mu(uint32_t epoch, float t, float l) {
  MuestraAmbiente m;
  m.epoch = epoch; m.tieneTemp = true; m.temp = t; m.tieneLuz = true; m.luz = l;
  return m;
}

int main() {
  HistorialAmbiente h;
  revisar("vacio: cantidad 0 y sin ultima", h.cantidad() == 0 && h.ultima() == nullptr);
  revisar("agrega la primera", h.agregar(mu(1000, 24.5f, 37)) && h.cantidad() == 1);
  revisar("no duplica la misma hora (dato guardado reenviado)", !h.agregar(mu(1000, 24.5f, 37)) && h.cantidad() == 1);
  revisar("no agrega una mas vieja", !h.agregar(mu(990, 20, 10)) && h.cantidad() == 1);
  uint32_t v = h.version();
  revisar("agrega una mas nueva y sube la version", h.agregar(mu(1060, 25, 40)) && h.version() == v + 1);
  revisar("orden: 0 = mas vieja", h.muestra(0).epoch == 1000 && h.muestra(1).epoch == 1060);

  HistorialAmbiente g;
  for (int i = 0; i < 75; i++) g.agregar(mu(2000 + 60 * i, (float)i, (float)i));
  revisar("llena: se queda con N=60", g.cantidad() == HistorialAmbiente::N);
  revisar("llena: la mas vieja es la #15", g.muestra(0).epoch == 2000 + 60 * 15);
  revisar("llena: la ultima es la #74", g.ultima()->epoch == 2000 + 60 * 74 && g.ultima()->temp == 74.0f);
  bool orden = true;
  for (int i = 1; i < g.cantidad(); i++) orden &= g.muestra(i).epoch > g.muestra(i - 1).epoch;
  revisar("llena: sigue en orden", orden);

  printf("\n%s (%d fallo(s))\n", fallos ? "HAY FALLOS" : "TODO OK", fallos);
  return fallos ? 1 : 0;
}
