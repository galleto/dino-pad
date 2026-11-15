// datos_tracker.h - Decodifica FromRadio con Nanopb y extrae los datos del T1000-E.
// C++ puro (sin Arduino) para poder probarlo en la PC (test/host_decode.cpp).
//
// Tipos generados con nanopb 0.4.9.3 a partir de los .proto oficiales:
//   https://github.com/meshtastic/protobufs  (ver tools/generar_nanopb.sh)
#pragma once
#include <stddef.h>
#include <stdint.h>

#include "src/mtpb/mesh.pb.h"
#include "src/mtpb/telemetry.pb.h"

// Funcion de log estilo printf (en el ESP32 envuelve Serial.printf; en la PC, printf)
typedef void (*FnLog)(const char* fmt, ...);

// Lo que se sabe del T1000-E. Cada dato lleva su bandera "tiene*": si el nodo
// no lo mando, no se muestra (no se inventan valores por defecto).
struct DatosTracker {
  // Identidad (MyNodeInfo, NodeInfo propio, DeviceMetadata)
  bool tieneMiNodo = false;
  uint32_t miNodo = 0;
  bool tieneUsuario = false;
  char nombreLargo[40] = "";
  char nombreCorto[5] = "";
  int hwModel = 0;
  bool tieneFirmware = false;
  char firmware[18] = "";
  uint16_t nodosEnDb = 0;          // NodeInfo recibidos (incluye el propio)

  // DeviceMetrics (NodeInfo propio o TELEMETRY_APP)
  bool tieneBateria = false;   uint32_t bateria = 0;   // 101 = alimentado por USB (firmware)
  bool tieneVoltaje = false;   float voltaje = 0;
  bool tieneUsoCanal = false;  float usoCanal = 0;
  bool tieneAirTx = false;     float airTx = 0;
  bool tieneUptime = false;    uint32_t uptime = 0;
  uint32_t msMetricas = 0;     // millis() de la ultima actualizacion (0 = nunca)
  // true = las metricas vienen del NodeInfo de la configuracion inicial: pueden ser
  // de antes de un reinicio del tracker. Pasa a false con la primera TELEMETRY_APP.
  bool metricasGuardadas = false;

  // Position (NodeInfo propio o POSITION_APP)
  bool tienePosicion = false;
  int32_t latitudI = 0, longitudI = 0;   // grados * 1e7
  bool tieneAltitud = false;   int32_t altitud = 0;
  uint32_t satelites = 0;
  uint32_t msPosicion = 0;

  // EnvironmentMetrics (TELEMETRY_APP; en el T1000-E: NTC y sensor de luz)
  bool tieneTemperatura = false; float temperatura = 0;
  bool tieneLuz = false;         float luz = 0;     // el firmware del T1000-E la manda como 0-100
  uint32_t msAmbiente = 0;

  // Configuracion relevante
  bool tieneCfgTelemetria = false;
  bool ambienteActivado = false;
  uint32_t intervaloAmbiente = 0;
  bool telemetriaDispositivoMesh = false;
  bool tieneCfgPosicion = false;
  int gpsMode = 0;
  uint32_t posicionBroadcastS = 0;
  uint32_t gpsUpdateIntervalS = 0;

  // Ultimo Routing (ACK/NAK) recibido. El firmware lo entrega al cliente como un
  // paquete ROUTING_APP cuyo Data.request_id es el id del paquete original
  // (mesh.proto: "Indicates the original message ID that this message is reporting
  // failure on"). error_reason NONE = ACK (en broadcast, ACK implicito).
  bool tieneRouting = false;
  uint32_t routingRequestId = 0;
  uint32_t routingFrom = 0;
  int routingError = 0;            // meshtastic_Routing_Error
  uint32_t routingContador = 0;    // sube con cada Routing nuevo

  bool cambio = false;   // la pantalla debe redibujar los datos
};

// Conteo de lo recibido, para el resumen de la configuracion inicial
struct Estadisticas {
  uint32_t total = 0;
  uint32_t errores = 0;           // FromRadio que Nanopb no pudo decodificar
  uint32_t porVariante[32] = {};  // indice = tag de FromRadio.payload_variant
  uint32_t porConfig[16] = {};    // indice = tag de Config.payload_variant
  uint32_t porModulo[32] = {};    // indice = tag de ModuleConfig.payload_variant
  struct { uint32_t portnum, cuenta; } porPuerto[16] = {};
  uint32_t telemetriaVariante[16] = {};  // indice = tag de Telemetry.variant
};

// Decodifica un FromRadio. 'out' debe ser estatico/global (768 B en el ESP32).
bool decodificarFromRadio(const uint8_t* datos, size_t len, meshtastic_FromRadio* out);

// Actualiza 'datos' y 'est' con un FromRadio ya decodificado. Si 'volcado' no es
// nulo, imprime una linea con el tipo y los datos reales del mensaje.
void procesarFromRadio(const meshtastic_FromRadio& fr, DatosTracker& datos, Estadisticas& est,
                       uint32_t ahoraMs, FnLog volcado);

// Resumen legible de los tipos recibidos y de los datos del tracker.
void imprimirResumen(const Estadisticas& est, const DatosTracker& datos, FnLog log);

// Nombre del tipo de FromRadio (p. ej. "node_info") a partir de su tag.
const char* nombreVariante(uint32_t tag);
