// Prueba en la PC del codificador de meshtastic_min.h.
// Escribe los mensajes en binario para decodificarlos con protoc y los .proto
// oficiales, y prueba el lector de FromRadio con bytes generados por protoc.
// Uso: ver firmware/ble_send/test/verificar.sh
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "../meshtastic_min.h"

static void guardar(const std::string& ruta, const uint8_t* d, size_t n) {
  std::ofstream f(ruta, std::ios::binary);
  f.write((const char*)d, (std::streamsize)n);
}

static void hex(const char* etiqueta, const uint8_t* d, size_t n) {
  printf("%-22s (%2zu B):", etiqueta, n);
  for (size_t i = 0; i < n; i++) printf(" %02x", d[i]);
  printf("\n");
}

int main(int argc, char** argv) {
  if (argc < 2) { fprintf(stderr, "uso: %s <dir_salida> [fromradio.bin ...]\n", argv[0]); return 2; }
  std::string dir = argv[1];
  uint8_t buf[512];
  size_t n;

  n = mt::encodeTextPacket(buf, sizeof buf, "prueba dinopad");
  if (!n) { fprintf(stderr, "encodeTextPacket fallo\n"); return 1; }
  hex("texto broadcast", buf, n);
  guardar(dir + "/texto.bin", buf, n);

  const uint32_t nonces[] = {1, 127, 128, 69420, 0xFFFFFFFFu};
  for (uint32_t nonce : nonces) {
    n = mt::encodeWantConfig(buf, sizeof buf, nonce);
    char et[32];
    snprintf(et, sizeof et, "want_config %u", nonce);
    hex(et, buf, n);
    guardar(dir + "/want_config_" + std::to_string(nonce) + ".bin", buf, n);
  }

  n = mt::encodeDisconnect(buf, sizeof buf);
  hex("disconnect", buf, n);
  guardar(dir + "/disconnect.bin", buf, n);

  // Limite de Data.payload = 233 bytes (mesh.options)
  std::string t233(233, 'a'), t234(234, 'a');
  size_t n233 = mt::encodeTextPacket(buf, sizeof buf, t233.c_str());
  printf("texto 233 B -> %zu B (debe ser > 0)\n", n233);
  guardar(dir + "/texto_233.bin", buf, n233);
  printf("texto 234 B -> %zu B (debe ser 0)\n",   mt::encodeTextPacket(buf, sizeof buf, t234.c_str()));
  printf("buffer chico -> %zu B (debe ser 0)\n",  mt::encodeTextPacket(buf, 10, "prueba dinopad"));

  // Lector de FromRadio sobre archivos generados por protoc --encode
  for (int i = 2; i < argc; i++) {
    std::ifstream f(argv[i], std::ios::binary);
    std::vector<uint8_t> d((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    mt::FromRadioInfo info = mt::parseFromRadio(d.data(), d.size());
    printf("parse %s: valido=%d campos=0x%08x configComplete=%d(%u) queueStatus=%d(res=%d free=%u maxlen=%u id=%u)\n",
           argv[i], info.valido, info.camposVistos, info.tieneConfigComplete, info.configCompleteId,
           info.tieneQueueStatus, info.qsRes, info.qsFree, info.qsMaxlen, info.qsPacketId);
  }
  return 0;
}
