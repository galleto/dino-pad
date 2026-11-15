// dinopad_pipboy: menu de 5 pestanas con los 3 botones y datos del T1000-E por BLE.
//
//   NEGRO            pestana anterior
//   BLANCO           pestana siguiente
//   ROJO corto       entrar a la pestana (seleccionar)
//   ROJO largo       volver (salir de la pestana / cerrar SOS)
//   NEGRO + BLANCO   SOS, sostenidos 3 s (solo pantalla: NO envia nada)
//
// Arquitectura:
//   conexion_ble.*  tarea FreeRTOS en el nucleo 0: conecta, lee y reconecta al tracker
//   compartido.*    estructura compartida con mutex (la tarea BLE escribe, loop copia)
//   datos_tracker.* decodificador FromRadio con Nanopb (src/mtpb, generado)
//   ui.*            dibujo; redibuja solo los campos que cambian
//   botones.*       logica de botones (probada en la PC: test/verificar_botones.sh)
// El bucle de botones nunca espera al BLE. Sin Wi-Fi. No envia nada por radio ni
// cambia la configuracion del tracker.
//
// Compilar con: --libraries firmware/libraries   (pines.h)
// Antes, una vez: firmware/ble_send/tools/generar_nanopb.sh  (genera src/mtpb)

#include <pines.h>

#include "botones.h"
#include "compartido.h"
#include "conexion_ble.h"
#include "ui.h"

// Nunca se envian mensajes desde este sketch (no hay codigo de envio).
static const bool ENVIAR_MENSAJE = false;

static const uint32_t REFRESCO_MS = 250;   // cada cuanto se copia el estado compartido

Botones botones;

static Modo modo = Modo::MENU;
static Modo modoAntesSos = Modo::MENU;
static int pestana = P_ESTADO;
static bool barraSosVisible = false;
static uint32_t ultimaBarraMs = 0;
static uint32_t ultimoRefresco = 0;
static Compartido copia;   // ~1 KB: global, no en la pila de loop()

static const char* nombreModo(Modo m) {
  return m == Modo::MENU ? "MENU" : m == Modo::DENTRO ? "DENTRO" : "SOS";
}

static void manejar(Evento e) {
  const char* nombre = nombreEvento(e);
  Serial.printf("[%lu ms] %s  (modo=%s, pestana=%s)\n", (unsigned long)millis(), nombre,
                nombreModo(modo), NOMBRES_PESTANA[pestana]);

  if (e == Evento::SOS) {
    if (modo != Modo::SOS) modoAntesSos = modo;
    modo = Modo::SOS;
    barraSosVisible = false;
    Serial.println("    SOS activado (solo pantalla, no se envia nada)");
    ui::pantallaSos();
    return;
  }

  switch (modo) {
    case Modo::SOS:
      if (e == Evento::SELECCIONAR || e == Evento::VOLVER) {   // ROJO corto o largo cierra
        modo = modoAntesSos;
        Serial.println("    SOS cerrado");
        ui::dibujarTodo(pestana, modo, "SOS cerrado");
        ultimoRefresco = 0;
      }
      return;

    case Modo::MENU:
      if (e == Evento::ANTERIOR) pestana = (pestana + N_PESTANAS - 1) % N_PESTANAS;
      else if (e == Evento::SIGUIENTE) pestana = (pestana + 1) % N_PESTANAS;
      else if (e == Evento::SELECCIONAR) modo = Modo::DENTRO;
      else if (e == Evento::VOLVER) { ui::pie("VOLVER (ya en el menu)"); return; }
      break;

    case Modo::DENTRO:
      if (e == Evento::VOLVER) modo = Modo::MENU;
      else {
        char t[48];
        snprintf(t, sizeof t, "%s (sin accion aqui todavia)", nombre);
        ui::pie(t);
        return;
      }
      break;
  }
  ui::cambioDePestana(pestana, modo);
  ui::pie(nombre);
  ultimoRefresco = 0;   // rellenar la pestana nueva ya
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n===== dinopad_pipboy =====");
  Serial.printf("Botones: NEGRO=%u BLANCO=%u ROJO=%u (INPUT_PULLUP, presionado=LOW)\n",
                PIN_BTN_NEGRO, PIN_BTN_BLANCO, PIN_BTN_ROJO);
  Serial.printf("ENVIAR_MENSAJE=%s (este sketch no tiene codigo de envio)\n",
                ENVIAR_MENSAJE ? "true" : "false");

  pinMode(PIN_BTN_NEGRO, INPUT_PULLUP);
  pinMode(PIN_BTN_BLANCO, INPUT_PULLUP);
  pinMode(PIN_BTN_ROJO, INPUT_PULLUP);

  ui::iniciar();
  ui::dibujarTodo(pestana, modo, "listo");

  compartidoIniciar();
  bleIniciar();   // tarea BLE en el nucleo 0
}

void loop() {
  uint32_t ahora = millis();
  botones.actualizar(!digitalRead(PIN_BTN_NEGRO), !digitalRead(PIN_BTN_BLANCO),
                     !digitalRead(PIN_BTN_ROJO), ahora);
  for (Evento e; (e = botones.siguienteEvento()) != Evento::NINGUNO;) manejar(e);

  // Barra de progreso mientras se sostiene NEGRO + BLANCO
  if (modo != Modo::SOS) {
    float p = botones.progresoSos(ahora);
    if (p >= 0) {
      if (!barraSosVisible || ahora - ultimaBarraMs >= 50) {
        ui::barraSos(p);
        barraSosVisible = true;
        ultimaBarraMs = ahora;
      }
    } else if (barraSosVisible) {
      ui::borrarBarraSos();
      barraSosVisible = false;
    }
  }

  // Datos del tracker: copia del estado compartido y redibujo de lo que cambio
  if (ahora - ultimoRefresco >= REFRESCO_MS) {
    ultimoRefresco = ahora;
    compartidoCopiar(copia);
    ui::actualizar(pestana, modo, copia, ahora);
  }
  delay(2);
}
