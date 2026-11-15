// red_mqtt.h - Wi-Fi + envío a la base, en su propia tarea FreeRTOS. Dos modos (secretos.h):
//   HTTPS (BASE_URL): lotes cada 3 s a POST /api/device/ingest del backend, con X-Device-Token.
//   MQTT (MQTT_HOST): publica en un broker con TLS.
//
// loop() NUNCA espera a la red: solo deja mensajes en una cola (redEnviar*), y la tarea
// "red" (nucleo 1, misma prioridad que loop) conecta, reconecta y publica. Si la cola se
// llena se descartan lecturas viejas; el SOS no se pierde (va por una bandera aparte).
//
// Temas (contrato de backend/mqtt_client.py y backend/models.py):
//   dinopad/vitals   VitalReading   BPM y SpO2 del simulador del ESP32: source "simulated"
//   dinopad/alertas  AlertMessage   {"type":"sos"} al sostener NEGRO+BLANCO (nunca desde demo.h)
//   dinopad/estado   DeviceStatus   telemetria REAL del T1000-E (bateria, RSSI, ...), cada 30 s
//   dinopad/ui       estado del menu (pestana, modo, ultimo evento) para el espejo de la web
//
// Sin secretos.h la red queda apagada y todo lo demas funciona igual.
#pragma once
#include <stdint.h>

#include "ui.h"
#include "vitales.h"

enum class EstadoRed : uint8_t {
  APAGADA,        // sin secretos.h
  WIFI,           // buscando / conectando el Wi-Fi
  HORA,           // esperando la hora por NTP (TLS la necesita para validar el certificado)
  BROKER,         // conectando al servidor (HTTPS) o al broker (MQTT); el pie dice SERVIDOR/BROKER
  CONECTADA,      // publicando
};
const char* nombreEstadoRed(EstadoRed e);

void redIniciar();                       // en setup(), despues de bleIniciar()
EstadoRed redEstado();
const char* redDetalle();                // ultimo motivo (para el serial y el pie)

// Llamadas desde loop(): no bloquean.
void redEnviarVital(const MuestraVital& m);
void redEnviarUi(int pestana, Modo modo, const char* evento, bool desdeDemo);
void redEnviarSos();                     // solo SOS de una persona (no de demo.h)
// Mensajes (pestana MENS -> base; base -> pantalla). Solo en modo HTTPS.
void redEnviarMensaje(const char* texto, const char* lora);   // lora: lo que paso con el envio por radio
void redEnviarLora(const char* estado);                       // ACK, NAK, SIN_RESPUESTA... del ultimo
void redEnviarAcuse(const char* id, const char* estado);      // "mostrado" | "leido"
struct MensajeBase {
  char id[16];
  char de[25];
  char texto[64];
};
bool redSiguienteMensajeBase(MensajeBase& out);               // false si no hay ninguno nuevo
