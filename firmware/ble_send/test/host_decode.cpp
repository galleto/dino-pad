// Prueba en la PC de datos_tracker.cpp (Nanopb) con FromRadio generados por protoc.
// Uso: ver test/verificar_decodificador.sh
#include <cstdarg>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <vector>

#include "../datos_tracker.h"

static void logPc(const char* fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  vprintf(fmt, ap);
  va_end(ap);
}

static meshtastic_FromRadio fr;

int main(int argc, char** argv) {
  DatosTracker datos;
  Estadisticas est;
  int fallos = 0;
  for (int i = 1; i < argc; i++) {
    std::ifstream f(argv[i], std::ios::binary);
    std::vector<uint8_t> d((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    if (!decodificarFromRadio(d.data(), d.size(), &fr)) {
      printf("NO DECODIFICA: %s\n", argv[i]);
      est.errores++;
      fallos++;
      continue;
    }
    procesarFromRadio(fr, datos, est, 1000u * (uint32_t)i, logPc);
  }
  imprimirResumen(est, datos, logPc);
  return fallos ? 1 : 0;
}
