// pines.h - Pines de la placa Dinopad (ESP32 clasico, ESP32-D0WD-V3).
// UNICO lugar donde se definen; lo usan ble_send, dinopad, dinopad_pipboy y
// test_botones. Compilar con:  --libraries firmware/libraries
#pragma once
#include <stdint.h>

// ===== Pantalla ILI9341 2.8" (SPI por defecto del ESP32 / VSPI) =====
// SCK=18, MOSI=23, MISO=19 los pone la libreria SPI; no hace falta declararlos.
static const uint8_t PIN_TFT_CS  = 5;
static const uint8_t PIN_TFT_DC  = 2;
static const uint8_t PIN_TFT_RST = 4;
static const uint8_t PIN_SPI_SCK  = 18;   // solo informativo
static const uint8_t PIN_SPI_MISO = 19;   // solo informativo
static const uint8_t PIN_SPI_MOSI = 23;   // solo informativo

// Orientacion del panel (firmware/test_geometria + test_madctl): setRotation(1)
// y JUSTO DESPUES escribir MADCTL (0x36) = 0x48. Resultado: 320 x 240.
static const uint8_t  TFT_ROTACION = 1;
static const uint8_t  TFT_MADCTL   = 0x48;
static const uint32_t TFT_SPI_FREQ = 10000000;   // 10 MHz
static const int16_t  TFT_ANCHO    = 320;
static const int16_t  TFT_ALTO     = 240;

// ===== Botones (a GND, usar INPUT_PULLUP: presionado = LOW) =====
// Medidos con firmware/test_botones en esta placa (el sketch original tenia
// BLANCO y ROJO al reves).
static const uint8_t PIN_BTN_NEGRO  = 13;
static const uint8_t PIN_BTN_BLANCO = 26;
static const uint8_t PIN_BTN_ROJO   = 14;
