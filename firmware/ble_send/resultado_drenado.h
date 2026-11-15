// resultado_drenado.h - Resultado de leer FromRadio hasta vacio.
// En un header aparte porque Arduino genera los prototipos de las funciones del
// .ino antes que los structs definidos en el mismo .ino.
#pragma once
#include <stdint.h>

struct ResultadoDrenado {
  int paquetes = 0;
  bool error = false;
  bool vioConfigComplete = false;   // config_complete_id == nonce
  bool vioQueueStatus = false;      // queueStatus con mesh_packet_id != 0
  int32_t qsRes = 0;
  uint32_t qsPacketId = 0;          // id que el firmware asigno al paquete enviado
};
