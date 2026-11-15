// pantalla.h - Interfaz en la ILI9341 de 2.8" (320x240, rotacion 1)
// Cableado igual que firmware/dinopad: CS=5, DC=2, RST=4 (SPI por defecto del ESP32).
#pragma once
#include <Arduino.h>

#include "datos_tracker.h"

enum class EstadoConexion { BUSCANDO, CONECTANDO, EMPAREJADO, CONECTADO, DESCONECTADO, FALLO };
enum class EstadoPaso { PENDIENTE, EN_CURSO, OK, ERROR, OMITIDO };

namespace pantalla {

void iniciar(const char* mac);
void estado(EstadoConexion e);
void nombreTracker(const char* nombre, int rssi);   // tras el escaneo
void paso(int n, EstadoPaso e);                     // n = 1..8
void enviado(const char* texto, bool confirmadoEnCola);
void ackEnvio(const char* texto, bool ok);          // 3a linea del recuadro: ACK/NAK del envio
void error(int paso, const char* motivo);
void aviso(const char* texto);                      // linea informativa en el recuadro inferior
void datos(const DatosTracker& d, uint32_t ahoraMs); // panel de datos (redibuja si d.cambio o cada 1 s)
void redibujarTodo();                               // fillScreen + todo desde el estado guardado

}  // namespace pantalla
