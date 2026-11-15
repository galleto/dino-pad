// mensajes.h - Mensajes predeterminados de la pestana MENS.
// Solo ASCII (la fuente de la pantalla no tiene acentos ni enie) y max 24 caracteres
// para que quepan en una fila de tamano 2. Probado en test/verificar_vitales.sh.
//
// Quien decide si un mensaje sale por radio: decidirEnvio() (abajo).
#pragma once
#include <stdint.h>

static const char* const MENSAJES_PREDETERMINADOS[] = {
    "Estoy bien",
    "Recibido, entendido",
    "Voy en camino",
    "Regreso al habitat",
    "Espero instrucciones",
    "Bateria baja",
    "Suministros bajos",
    "Necesito ayuda medica",
};
static const int N_MENSAJES = sizeof(MENSAJES_PREDETERMINADOS) / sizeof(MENSAJES_PREDETERMINADOS[0]);
static const int MAX_CHARS_MENSAJE = 24;

// Que hacer cuando se elige un mensaje en MENS.
enum class DecisionEnvio : uint8_t {
  SIMULADO_DEMO,   // lo pidio el guion de DEMO_AUTOMATICO: solo pantalla, rotulo DEMO
  DESACTIVADO,     // ENVIAR_MENSAJE = false: solo pantalla
  ESPERA,          // hubo un envio hace menos de 'pausaMs'
  REAL,            // pedirlo a la tarea BLE (sale por radio)
};

// El guion de demo NUNCA envia por radio, aunque ENVIAR_MENSAJE sea true.
inline DecisionEnvio decidirEnvio(bool desdeDemo, bool enviarMensaje, bool huboEnvio, uint32_t msDesdeUltimo,
                                  uint32_t pausaMs) {
  if (desdeDemo) return DecisionEnvio::SIMULADO_DEMO;
  if (!enviarMensaje) return DecisionEnvio::DESACTIVADO;
  if (huboEnvio && msDesdeUltimo < pausaMs) return DecisionEnvio::ESPERA;
  return DecisionEnvio::REAL;
}
