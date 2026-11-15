// ui.h - Dibujo del menu y de las pestanas en la ILI9341 (320x240).
// Redibuja solo lo que cambia: cada campo recuerda el texto y color que tiene
// dibujado y solo se repinta si alguno cambio.
#pragma once
#include <stdint.h>

#include "compartido.h"
#include "vitales.h"

enum class Modo : uint8_t { MENU, DENTRO, SOS };

// Pestanas (orden en pantalla)
enum Pestana : uint8_t { P_ESTADO = 0, P_AMBIENTE, P_TRACK, P_VITAL, P_MENS, N_PESTANAS };
extern const char* const NOMBRES_PESTANA[N_PESTANAS];

namespace ui {

void iniciar();                                            // pantalla + orientacion (pines.h)
void dibujarTodo(int pestana, Modo modo, const char* evento);   // borra y dibuja todo
void cambioDePestana(int pestana, Modo modo);              // pestanas + contenido nuevo
void pie(const char* evento);
// Demo automatica (demo.h): rotulo "DEMO AUTO" fijo en la barra de titulo, y el pie
// marca "Ultimo DEMO:" cuando el evento lo genero el guion y no un boton.
void ponerDemoAutomatico(bool activo);
void origenEventoDemo(bool desdeDemo);
// Refresca la pestana actual y el indicador BLE desde una copia de los datos.
void actualizar(int pestana, Modo modo, const Compartido& c, const DatosVitales& v, uint32_t ahora);

// TRACK: dentro de la pestana, NEGRO/BLANCO cambian de pagina en la lista de nodos.
void moverPaginaTrack(int delta);
void reiniciarPaginaTrack();
// MENS: dentro de la pestana, NEGRO/BLANCO mueven el cursor de los mensajes predeterminados.
void moverCursorMens(int delta);
const char* mensajeSeleccionado();
void elegirMensaje(int i);   // pone el cursor de MENS en el mensaje i (comando serial "msg i")

void barraSos(float progreso);   // 0..1
void borrarBarraSos();
// linea: lo que pasa con la alerta ("Alerta enviada a la base", "DEMO: no se envia", ...)
void pantallaSos(const char* linea);
// Mensaje de la base (web): pantalla completa hasta que se pulse un boton.
void pantallaMensajeBase(const char* de, const char* texto);

}  // namespace ui
