// demo.h - Recorrido automatico del menu para placas SIN botones.
// Se activa con DEMO_AUTOMATICO = true en dinopad_pipboy.ino. Cada paso es el mismo
// evento que generaria un boton, asi que la pantalla se comporta igual que a mano.
// Al terminar la lista vuelve a empezar. Los botones reales siguen funcionando.
// En MENS envia "Estoy bien" de verdad, pero solo una vez por firmware subido.
#pragma once
#include "botones.h"

struct PasoDemo {
  Evento evento;
  uint32_t esperaMs;   // tiempo en pantalla despues de este evento
};

static const PasoDemo GUION_DEMO[] = {
    // ESTADO
    {Evento::SELECCIONAR, 8000}, {Evento::VOLVER, 1500}, {Evento::SIGUIENTE, 1500},
    // AMBIENTE
    {Evento::SELECCIONAR, 8000}, {Evento::VOLVER, 1500}, {Evento::SIGUIENTE, 1500},
    // TRACK: pagina 1, pagina 2 y regresar
    {Evento::SELECCIONAR, 6000}, {Evento::SIGUIENTE, 5000}, {Evento::ANTERIOR, 2000},
    {Evento::VOLVER, 1500}, {Evento::SIGUIENTE, 1500},
    // VITAL
    {Evento::SELECCIONAR, 10000}, {Evento::VOLVER, 1500}, {Evento::SIGUIENTE, 1500},
    // MENS: mover el cursor, volver a "Estoy bien" y enviarlo. El envio real ocurre
    // UNA vez por firmware subido (NVS); en las siguientes vueltas solo lo avisa.
    {Evento::SELECCIONAR, 2000}, {Evento::SIGUIENTE, 1500}, {Evento::ANTERIOR, 1500},
    {Evento::SELECCIONAR, 15000}, {Evento::VOLVER, 1500}, {Evento::SIGUIENTE, 1500},
    // SOS (solo pantalla, no envia nada) y cerrarlo; de vuelta en ESTADO
    {Evento::SOS, 4000}, {Evento::SELECCIONAR, 3000},
};
static const int N_PASOS_DEMO = sizeof(GUION_DEMO) / sizeof(GUION_DEMO[0]);

class Demo {
 public:
  // Devuelve el evento que toca ahora, o NINGUNO si todavia no es tiempo.
  Evento siguiente(uint32_t ms) {
    if (ms < proximoMs_) return Evento::NINGUNO;
    const PasoDemo& p = GUION_DEMO[i_];
    i_ = (i_ + 1) % N_PASOS_DEMO;
    proximoMs_ = ms + p.esperaMs;
    return p.evento;
  }
  void empezarEn(uint32_t ms) { proximoMs_ = ms; }

 private:
  int i_ = 0;
  uint32_t proximoMs_ = 0;
};
