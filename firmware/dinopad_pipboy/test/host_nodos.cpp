// Prueba en la PC de nodos.h. Uso: test/verificar_nodos.sh
#include <cstdio>
#include <cstring>

#include "../nodos.h"

static int fallos = 0;
static void revisar(const char* caso, bool ok) {
  if (!ok) fallos++;
  printf("%-4s %s\n", ok ? "OK" : "FALLA", caso);
}

int main() {
  ListaNodos l;
  revisar("vacia", l.cantidad() == 0);
  l.actualizar(0, "X", true, 1, 100, false);
  revisar("ignora num 0", l.cantidad() == 0);

  l.actualizar(0x11, "AAA", true, 2, 1000, false);
  l.actualizar(0x22, "BBB", false, 0, 2000, true);
  revisar("agrega dos", l.cantidad() == 2);

  // Paquete del mismo nodo sin nombre: no borra el nombre, actualiza saltos y hora
  l.actualizar(0x11, nullptr, true, 1, 3000, false);
  revisar("no duplica y conserva el nombre", l.cantidad() == 2 && strcmp(l.nodo(0).corto, "AAA") == 0);
  revisar("toma saltos y hora mas nuevos", l.nodo(0).saltos == 1 && l.nodo(0).lastHeard == 3000);

  // Dato viejo (paquete reenviado del volcado inicial): no retrocede
  l.actualizar(0x11, nullptr, true, 5, 1500, true);
  revisar("dato viejo no cambia saltos ni hora", l.nodo(0).saltos == 1 && l.nodo(0).lastHeard == 3000 &&
                                                      !l.nodo(0).viaMqtt);

  l.actualizar(0x33, "NOMBRELARGO", false, 0, 0, false);
  revisar("recorta el nombre a 4", strcmp(l.nodo(2).corto, "NOMB") == 0);

  uint8_t idx[ListaNodos::N];
  int n = l.ordenados(idx);
  revisar("orden por mas reciente", n == 3 && l.nodo(idx[0]).num == 0x11 && l.nodo(idx[1]).num == 0x22 &&
                                        l.nodo(idx[2]).num == 0x33);

  ListaNodos g;
  for (uint32_t i = 1; i <= ListaNodos::N; i++) g.actualizar(i, "N", false, 0, 1000 + i, false);
  revisar("llena con N", g.cantidad() == ListaNodos::N);
  g.actualizar(999, "NEW", false, 0, 500, false);
  revisar("llena: no entra uno mas viejo que todos", g.cantidad() == ListaNodos::N && g.nodo(0).num == 1);
  g.actualizar(999, "NEW", false, 0, 9000, false);
  revisar("llena: uno nuevo reemplaza al mas viejo", g.nodo(0).num == 999);

  uint32_t v = g.version();
  g.actualizar(5, nullptr, false, 0, 9100, false);
  revisar("sube la version", g.version() == v + 1);

  printf("\n%s\n", fallos ? "HAY FALLOS" : "TODO OK");
  return fallos ? 1 : 0;
}
