// ui.h - Dibujo del menu y de las pestanas en la ILI9341 (320x240).
// Redibuja solo lo que cambia: cada campo recuerda el texto y color que tiene
// dibujado y solo se repinta si alguno cambio.
#pragma once
#include <stdint.h>

#include "compartido.h"

enum class Modo : uint8_t { MENU, DENTRO, SOS };

// Pestanas (orden en pantalla)
enum Pestana : uint8_t { P_ESTADO = 0, P_AMBIENTE, P_TRACK, P_VITAL, P_MENS, N_PESTANAS };
extern const char* const NOMBRES_PESTANA[N_PESTANAS];

namespace ui {

void iniciar();                                            // pantalla + orientacion (pines.h)
void dibujarTodo(int pestana, Modo modo, const char* evento);   // borra y dibuja todo
void cambioDePestana(int pestana, Modo modo);              // pestanas + contenido nuevo
void pie(const char* evento);
// Refresca la pestana actual y el indicador BLE desde una copia de los datos.
void actualizar(int pestana, Modo modo, const Compartido& c, uint32_t ahora);

void barraSos(float progreso);   // 0..1
void borrarBarraSos();
void pantallaSos();

}  // namespace ui
