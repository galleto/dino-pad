// compartido.h - Datos que la tarea BLE escribe y la interfaz lee.
// La tarea BLE (nucleo 0) actualiza la estructura con el mutex tomado; la
// interfaz (loop, nucleo 1) saca una COPIA con compartidoCopiar() y dibuja
// desde la copia, asi nunca espera al BLE.
#pragma once
#include <stdint.h>

#include "datos_tracker.h"

enum class EstadoBle : uint8_t {
  INICIANDO,
  BUSCANDO,        // escaneando la MAC del tracker
  CONECTANDO,
  EMPAREJANDO,     // PIN / cifrado
  LEYENDO_CONFIG,  // want_config_id y lectura de FromRadio
  CONECTADO,       // escuchando telemetria
  DESCONECTADO,    // esperando para reintentar
};

const char* nombreEstadoBle(EstadoBle e);

struct Compartido {
  EstadoBle estado = EstadoBle::INICIANDO;
  uint32_t msEstado = 0;          // millis() del ultimo cambio de estado
  char motivo[48] = "";           // detalle del ultimo fallo / desconexion
  uint32_t reintentoMs = 0;       // millis() del proximo intento (en DESCONECTADO)
  uint32_t conexiones = 0;        // conexiones completas desde el arranque
  uint32_t paquetesConfig = 0;    // FromRadio leidos en la ultima configuracion

  bool tieneRssi = false;         // RSSI: del anuncio al encontrarlo, luego de la conexion
  int rssi = 0;
  uint32_t msRssi = 0;

  DatosTracker datos;             // lo decodificado del tracker (datos_tracker.h)
  uint32_t version = 0;           // sube con cada cambio
};

void compartidoIniciar();                  // crea el mutex (llamar en setup)
void compartidoCopiar(Compartido& destino);   // copia consistente para la interfaz

// Uso desde la tarea BLE: bloquear, modificar compartidoRef(), soltar.
void compartidoBloquear();
void compartidoSoltar();
Compartido& compartidoRef();
