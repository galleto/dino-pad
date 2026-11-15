// botones.h - Logica de los 3 botones del menu (C++ puro, sin Arduino, para
// poder probarla en la PC: test/verificar_botones.sh).
//
//   NEGRO            -> ANTERIOR     (al soltar)
//   BLANCO           -> SIGUIENTE    (al soltar)
//   ROJO corto       -> SELECCIONAR  (al soltar, si duro menos de ROJO_LARGO_MS)
//   ROJO largo       -> VOLVER       (al cumplir ROJO_LARGO_MS, sin esperar a soltar)
//   NEGRO + BLANCO   -> SOS          (ambos sostenidos SOS_MS)
//
// NEGRO y BLANCO actuan al SOLTAR para no mover el menu cuando en realidad se
// esta empezando la combinacion de SOS: si mientras uno estaba presionado se
// presiono tambien el otro, ninguno de los dos genera ANTERIOR/SIGUIENTE.
#pragma once
#include <stdint.h>

enum class Evento : uint8_t { NINGUNO, ANTERIOR, SIGUIENTE, SELECCIONAR, VOLVER, SOS };

const char* nombreEvento(Evento e);

struct TiemposBotones {
  uint32_t antirreboteMs = 30;
  uint32_t rojoLargoMs   = 800;
  uint32_t sosMs         = 3000;
};

class Botones {
 public:
  explicit Botones(TiemposBotones t = TiemposBotones()) : t_(t) {}

  // Llamar seguido (cada pocos ms). true = boton presionado (ya invertido).
  void actualizar(bool negro, bool blanco, bool rojo, uint32_t ms);

  // Saca el siguiente evento pendiente (NINGUNO si no hay).
  Evento siguienteEvento();

  // Progreso de la combinacion de SOS: -1 si no se esta sosteniendo,
  // 0..1 mientras se sostiene (antes de disparar).
  float progresoSos(uint32_t ms) const;

  // Estado ya filtrado (despues del antirrebote), para mostrarlo.
  bool negro() const { return b_[NEGRO].estable; }
  bool blanco() const { return b_[BLANCO].estable; }
  bool rojo() const { return b_[ROJO].estable; }

 private:
  enum { NEGRO = 0, BLANCO = 1, ROJO = 2 };
  struct Boton {
    bool estable = false;     // presionado tras antirrebote
    bool crudo = false;
    uint32_t cambioMs = 0;    // ultimo cambio crudo
    uint32_t presionMs = 0;   // cuando se presiono (estable)
  };

  void encolar(Evento e);
  void alPresionar(int i, uint32_t ms);
  void alSoltar(int i, uint32_t ms);

  TiemposBotones t_;
  Boton b_[3];
  bool comboUsado_ = false;    // NEGRO y BLANCO estuvieron juntos en esta pulsacion
  bool comboActivo_ = false;   // ambos sostenidos ahora
  uint32_t comboInicioMs_ = 0;
  bool sosDisparado_ = false;
  bool rojoLargoDisparado_ = false;

  Evento cola_[8];
  uint8_t ini_ = 0, n_ = 0;
};
