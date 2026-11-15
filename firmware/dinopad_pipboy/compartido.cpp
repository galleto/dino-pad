// compartido.cpp - ver compartido.h
#include "compartido.h"

#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

static Compartido datos;
static SemaphoreHandle_t mutex = nullptr;

const char* nombreEstadoBle(EstadoBle e) {
  switch (e) {
    case EstadoBle::INICIANDO:      return "INICIANDO";
    case EstadoBle::BUSCANDO:       return "BUSCANDO";
    case EstadoBle::CONECTANDO:     return "CONECTANDO";
    case EstadoBle::EMPAREJANDO:    return "EMPAREJANDO";
    case EstadoBle::LEYENDO_CONFIG: return "LEYENDO CONFIG";
    case EstadoBle::CONECTADO:      return "CONECTADO";
    case EstadoBle::DESCONECTADO:   return "DESCONECTADO";
  }
  return "?";
}

void compartidoIniciar() {
  if (!mutex) mutex = xSemaphoreCreateMutex();
}

void compartidoBloquear() { xSemaphoreTake(mutex, portMAX_DELAY); }
void compartidoSoltar() { xSemaphoreGive(mutex); }
Compartido& compartidoRef() { return datos; }

void compartidoCopiar(Compartido& destino) {
  compartidoBloquear();
  destino = datos;   // la tarea BLE solo tiene el mutex durante cambios cortos
  compartidoSoltar();
}
