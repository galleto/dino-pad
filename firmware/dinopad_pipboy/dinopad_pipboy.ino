// dinopad_pipboy: menu de 5 pestanas con los 3 botones y datos del T1000-E por BLE.
//
//   NEGRO            pestana anterior   (dentro de TRACK: pagina anterior de nodos)
//   BLANCO           pestana siguiente  (dentro de TRACK: pagina siguiente de nodos)
//   ROJO corto       entrar a la pestana (seleccionar)
//   ROJO largo       volver (salir de la pestana / cerrar SOS)
//   Dentro de MENS: NEGRO/BLANCO eligen un mensaje predeterminado y ROJO corto lo
//   envia por el T1000-E (broadcast, canal primario) si ENVIAR_MENSAJE = true.
//   NEGRO + BLANCO   SOS, sostenidos 3 s: pantalla SOS y, con red, alerta SOS a la base
//                    (dinopad/alertas). El SOS del guion de demo.h NUNCA se envia.
//
// Arquitectura:
//   conexion_ble.*  tarea FreeRTOS en el nucleo 0: conecta, lee y reconecta al tracker
//   compartido.*    estructura compartida con mutex (la tarea BLE escribe, loop copia)
//   datos_tracker.* decodificador FromRadio con Nanopb (src/mtpb, generado)
//   ui.*            dibujo; redibuja solo los campos que cambian
//   botones.*       logica de botones (probada en la PC: test/verificar_botones.sh)
//   red_mqtt.*      Wi-Fi + MQTT (TLS) al broker en la nube, en su propia tarea; sin
//                   secretos.h queda apagada (ver secretos.ejemplo.h)
// El bucle de botones nunca espera al BLE ni a la red. No cambia la configuracion del
// tracker. Por LoRa solo salen los mensajes de MENS (ver ENVIAR_MENSAJE).
//
// Compilar con: --libraries firmware/libraries   (pines.h)
// Antes, una vez: firmware/ble_send/tools/generar_nanopb.sh  (genera src/mtpb)

#include <pines.h>

#include "botones.h"
#include "compartido.h"
#include "conexion_ble.h"
#include "demo.h"
#include "mensajes.h"
#include "red_mqtt.h"
#include "simulador_vital.h"
#include "vitales.h"
#include "ui.h"

// true: MENS envia de verdad por el T1000-E (broadcast en el canal primario, PUBLICO),
// solo al presionar ROJO, con ENVIO_PAUSA_MS entre envios. El guion de DEMO_AUTOMATICO
// nunca envia por radio: simula el envio en pantalla con rotulo DEMO (decidirEnvio()).
static const bool ENVIAR_MENSAJE = false;
static const uint32_t ENVIO_PAUSA_MS = 30000;

// true: recorre el menu solo (demo.h), para placas sin botones.
static const bool DEMO_AUTOMATICO = true;

static const uint32_t REFRESCO_MS = 250;   // cada cuanto se copia el estado compartido

Botones botones;

static Modo modo = Modo::MENU;
static Modo modoAntesSos = Modo::MENU;
static int pestana = P_ESTADO;
static bool barraSosVisible = false;
static uint32_t ultimaBarraMs = 0;
static uint32_t ultimoRefresco = 0;
static Demo demo;
static uint32_t ultimoEnvioMs = 0;
static bool huboEnvio = false;
static EstadoEnvio envioMostrado = EstadoEnvio::NINGUNO;
static SimuladorVital simulador;   // BPM/SpO2 DEMO: cambiar por el MAX30102 (simulador_vital.h)
static DatosVitales vitales;
static Compartido copia;   // ~1 KB: global, no en la pila de loop()

static const char* nombreModo(Modo m) {
  return m == Modo::MENU ? "MENU" : m == Modo::DENTRO ? "DENTRO" : "SOS";
}

// Pide a la tarea BLE que envie el mensaje seleccionado. Devuelve el texto del pie.
static const char* pedirEnvio(bool desdeDemo, char* t, size_t n) {
  const char* msg = ui::mensajeSeleccionado();
  switch (decidirEnvio(desdeDemo, ENVIAR_MENSAJE, huboEnvio, millis() - ultimoEnvioMs, ENVIO_PAUSA_MS)) {
    case DecisionEnvio::SIMULADO_DEMO:   // el pie ya dice "Ultimo DEMO:"
      snprintf(t, n, "ENVIO SIMULADO: %s", msg);
      return t;
    case DecisionEnvio::DESACTIVADO:
      snprintf(t, n, "NO ENVIADO (ENVIAR=false): %s", msg);
      return t;
    case DecisionEnvio::ESPERA:
      snprintf(t, n, "Espera %lus para otro envio",
               (unsigned long)((ENVIO_PAUSA_MS - (millis() - ultimoEnvioMs)) / 1000 + 1));
      return t;
    case DecisionEnvio::REAL:
      break;
  }
  compartidoBloquear();
  Compartido& c = compartidoRef();
  bool conectado = c.estado == EstadoBle::CONECTADO;
  bool ocupado = c.envio == EstadoEnvio::PEDIDO || c.envio == EstadoEnvio::ESCRITO;
  if (conectado && !ocupado) {
    snprintf(c.envioTexto, sizeof c.envioTexto, "%s", msg);
    c.envio = EstadoEnvio::PEDIDO;
    c.envioId = 0;
    c.envioMs = millis();
    c.version++;
  }
  compartidoSoltar();
  if (!conectado) { snprintf(t, n, "NO ENVIADO: BLE no conectado"); return t; }
  if (ocupado) { snprintf(t, n, "NO ENVIADO: hay otro envio en curso"); return t; }
  huboEnvio = true;
  ultimoEnvioMs = millis();
  Serial.printf("    MENS: envio pedido \"%s\" (broadcast, canal primario)\n", msg);
  snprintf(t, n, "ENVIANDO: %s", msg);
  return t;
}

static void manejarEvento(Evento e, bool desdeDemo);

// Cada evento se maneja y, despues, el estado del menu se manda al espejo de la web.
static void manejar(Evento e, bool desdeDemo = false) {
  manejarEvento(e, desdeDemo);
  redEnviarUi(pestana, modo, nombreEvento(e), desdeDemo);
}

static void manejarEvento(Evento e, bool desdeDemo) {
  const char* nombre = nombreEvento(e);
  ui::origenEventoDemo(desdeDemo);   // el pie dira "Ultimo DEMO:" si lo genero demo.h
  Serial.printf("[%lu ms] %s  (modo=%s, pestana=%s)\n", (unsigned long)millis(), nombre,
                nombreModo(modo), NOMBRES_PESTANA[pestana]);

  if (e == Evento::SOS) {
    if (modo != Modo::SOS) modoAntesSos = modo;
    modo = Modo::SOS;
    barraSosVisible = false;
    if (desdeDemo) {
      Serial.println("    SOS del guion DEMO (solo pantalla, no se envia)");
    } else {
      redEnviarSos();
      Serial.printf("    SOS activado: alerta a la base (red %s)\n", nombreEstadoRed(redEstado()));
    }
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
      if (e == Evento::ANTERIOR || e == Evento::SIGUIENTE) ui::reiniciarPaginaTrack();
      else if (e == Evento::SELECCIONAR) modo = Modo::DENTRO;
      else if (e == Evento::VOLVER) { ui::pie("VOLVER (ya en el menu)"); return; }
      break;

    case Modo::DENTRO:
      if (e == Evento::VOLVER) modo = Modo::MENU;
      else if (pestana == P_TRACK && (e == Evento::ANTERIOR || e == Evento::SIGUIENTE)) {
        ui::moverPaginaTrack(e == Evento::SIGUIENTE ? 1 : -1);   // pagina de la lista de nodos
        ui::pie(e == Evento::SIGUIENTE ? "pagina siguiente" : "pagina anterior");
        ultimoRefresco = 0;
        return;
      } else if (pestana == P_MENS && (e == Evento::ANTERIOR || e == Evento::SIGUIENTE)) {
        ui::moverCursorMens(e == Evento::SIGUIENTE ? 1 : -1);
        ui::pie(ui::mensajeSeleccionado());
        ultimoRefresco = 0;
        return;
      } else if (pestana == P_MENS && e == Evento::SELECCIONAR) {
        char t[64];
        const char* r = pedirEnvio(desdeDemo, t, sizeof t);
        Serial.printf("    MENS: %s\n", r);
        ui::pie(r);
        return;
      } else {
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
  Serial.printf("ENVIAR_MENSAJE=%s (el guion de demo nunca envia por radio)\n",
                ENVIAR_MENSAJE ? "true" : "false");

  pinMode(PIN_BTN_NEGRO, INPUT_PULLUP);
  pinMode(PIN_BTN_BLANCO, INPUT_PULLUP);
  pinMode(PIN_BTN_ROJO, INPUT_PULLUP);

  ui::iniciar();
  ui::ponerDemoAutomatico(DEMO_AUTOMATICO);
  ui::dibujarTodo(pestana, modo, "listo");

  compartidoIniciar();
  bleIniciar();   // tarea BLE en el nucleo 0
  redIniciar();   // tarea de red en el nucleo 1 (apagada sin secretos.h)

  Serial.printf("DEMO_AUTOMATICO=%s\n", DEMO_AUTOMATICO ? "true (recorre el menu solo)" : "false");
  demo.empezarEn(millis() + 3000);   // 3 s en el menu antes de empezar
}

void loop() {
  uint32_t ahora = millis();
  botones.actualizar(!digitalRead(PIN_BTN_NEGRO), !digitalRead(PIN_BTN_BLANCO),
                     !digitalRead(PIN_BTN_ROJO), ahora);
  for (Evento e; (e = botones.siguienteEvento()) != Evento::NINGUNO;) manejar(e);
  if (DEMO_AUTOMATICO) {
    Evento e = demo.siguiente(ahora);
    if (e != Evento::NINGUNO) { Serial.print("[DEMO] "); manejar(e, true); }
  }

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

  // Signos vitales (simulados): una muestra cada 2 s
  MuestraVital mv;
  if (simulador.leer(ahora, mv)) {
    vitales.historial.agregar(mv);
    redEnviarVital(mv);   // a la base como source "simulated" (la web los rotula DEMO)
  }

  // Cambios de la red: al serial (lo hace red_mqtt) y al pie de la pantalla
  static EstadoRed redMostrada = EstadoRed::APAGADA;
  if (redEstado() != redMostrada && modo != Modo::SOS) {
    redMostrada = redEstado();
    char t[48];
    snprintf(t, sizeof t, "RED: %s", nombreEstadoRed(redMostrada));
    ui::pie(t);
  }

  // Datos del tracker: copia del estado compartido y redibujo de lo que cambio
  if (ahora - ultimoRefresco >= REFRESCO_MS) {
    ultimoRefresco = ahora;
    compartidoCopiar(copia);
    ui::actualizar(pestana, modo, copia, vitales, ahora);
    // Avance del envio (lo lleva la tarea BLE): mostrarlo en el pie
    if (copia.envio != envioMostrado && modo != Modo::SOS) {
      envioMostrado = copia.envio;
      if (copia.envio != EstadoEnvio::NINGUNO && copia.envio != EstadoEnvio::PEDIDO) {
        char t[64];
        snprintf(t, sizeof t, "%s: %s", nombreEstadoEnvio(copia.envio), copia.envioTexto);
        ui::pie(t);
      }
    }
  }
  delay(2);
}
