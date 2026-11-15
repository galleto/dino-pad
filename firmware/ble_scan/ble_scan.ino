// Escaner BLE para ESP32 con NimBLE-Arduino 2.x
// Busca nodos Meshtastic (por UUID de servicio) y resalta el T1000-E objetivo.
// Serial a 115200: nombre, MAC y RSSI de cada nodo, sin repetidos por MAC.

#include <NimBLEDevice.h>
#include <algorithm>
#include <set>
#include <string>
#include <vector>

// ===== CONFIGURACION =====
#define DURACION_ESCANEO_MS  5000   // duracion de cada ronda de escaneo
#define PAUSA_ENTRE_RONDAS   1000   // ms entre rondas
#define ESCANEO_ACTIVO       true   // true = pide "scan response" (suele traer el nombre)

// UUID del servicio BLE de Meshtastic.
// Fuente: https://meshtastic.org/docs/development/device/client-api/
static const NimBLEUUID UUID_MESHTASTIC("6ba1b218-15a8-461f-9fa8-5dcae273eafd");

// T1000-E objetivo (G93_a6bb). NimBLE imprime las MAC en minusculas.
static const NimBLEAddress MAC_OBJETIVO("f0:d4:6c:51:a6:bb", BLE_ADDR_PUBLIC);

struct Visto {
  std::string nombre;
  std::string mac;
  int rssi;
  bool objetivo;
};

std::vector<Visto> vistos;     // nodos Meshtastic de la ronda actual
std::set<std::string> macsVistas;  // para no repetir por MAC
volatile bool rondaTerminada = false;
uint32_t numeroRonda = 0;
uint32_t totalAnuncios = 0;    // todos los anuncios BLE recibidos (contexto)

// Compara solo los 6 bytes: el tipo de direccion (publica/aleatoria) que
// reporte el T1000-E no importa para reconocerlo.
bool esObjetivo(const NimBLEAddress& a) {
  return memcmp(a.getVal(), MAC_OBJETIVO.getVal(), 6) == 0;
}

class CallbacksEscaneo : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* dev) override {
    totalAnuncios++;
    if (!dev->isAdvertisingService(UUID_MESHTASTIC)) return;

    std::string mac = dev->getAddress().toString();
    if (!macsVistas.insert(mac).second) return;   // ya listado en esta ronda

    bool obj = esObjetivo(dev->getAddress());
    std::string nombre = dev->haveName() ? dev->getName() : "";
    int rssi = dev->getRSSI();

    Serial.printf("%s %-20s  %s  %4d dBm\n",
                  obj ? ">>" : "  ",
                  nombre.empty() ? "(sin nombre)" : nombre.c_str(),
                  mac.c_str(), rssi);

    vistos.push_back({nombre, mac, rssi, obj});
  }

  void onScanEnd(const NimBLEScanResults& resultados, int motivo) override {
    rondaTerminada = true;
  }
};

CallbacksEscaneo callbacks;

void iniciarRonda() {
  vistos.clear();
  macsVistas.clear();
  totalAnuncios = 0;
  numeroRonda++;
  Serial.printf("\n===== Ronda %lu (%d ms) - nodos Meshtastic =====\n",
                (unsigned long)numeroRonda, DURACION_ESCANEO_MS);
  Serial.printf("   %-20s  %-17s  %s\n", "NOMBRE", "MAC", "RSSI");
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->clearResults();
  rondaTerminada = false;
  scan->start(DURACION_ESCANEO_MS, false, true);
}

void imprimirResumen() {
  std::sort(vistos.begin(), vistos.end(),
            [](const Visto& a, const Visto& b) { return a.rssi > b.rssi; });

  const Visto* objetivo = nullptr;
  for (const auto& v : vistos) if (v.objetivo) objetivo = &v;

  Serial.printf("----- %u nodo(s) Meshtastic de %lu anuncios BLE -----\n",
                (unsigned)vistos.size(), (unsigned long)totalAnuncios);
  if (objetivo) {
    Serial.printf("OBJETIVO ENCONTRADO: %s  %s  %d dBm\n",
                  objetivo->nombre.empty() ? "(sin nombre)" : objetivo->nombre.c_str(),
                  objetivo->mac.c_str(), objetivo->rssi);
  } else {
    Serial.printf("Objetivo %s NO visto en esta ronda\n", MAC_OBJETIVO.toString().c_str());
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\nEscaner BLE Meshtastic (NimBLE) iniciado");
  Serial.printf("Objetivo: %s\n", MAC_OBJETIVO.toString().c_str());

  NimBLEDevice::init("");
  NimBLEScan* scan = NimBLEDevice::getScan();
  // Con cientos de anuncios el filtro de duplicados de NimBLE se desborda;
  // la deduplicacion real se hace aqui por MAC.
  scan->setScanCallbacks(&callbacks, false);
  scan->setActiveScan(ESCANEO_ACTIVO);
  scan->setInterval(100);
  scan->setWindow(99);

  iniciarRonda();
}

void loop() {
  if (rondaTerminada) {
    imprimirResumen();
    delay(PAUSA_ENTRE_RONDAS);
    iniciarRonda();
  }
  delay(10);
}
