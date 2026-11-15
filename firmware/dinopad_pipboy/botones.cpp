// botones.cpp - ver botones.h
#include "botones.h"

const char* nombreEvento(Evento e) {
  switch (e) {
    case Evento::ANTERIOR:    return "ANTERIOR";
    case Evento::SIGUIENTE:   return "SIGUIENTE";
    case Evento::SELECCIONAR: return "SELECCIONAR";
    case Evento::VOLVER:      return "VOLVER";
    case Evento::SOS:         return "SOS";
    default:                  return "NINGUNO";
  }
}

void Botones::encolar(Evento e) {
  if (n_ == sizeof(cola_) / sizeof(cola_[0])) return;   // cola llena: se descarta
  cola_[(ini_ + n_) % (sizeof(cola_) / sizeof(cola_[0]))] = e;
  n_++;
}

Evento Botones::siguienteEvento() {
  if (!n_) return Evento::NINGUNO;
  Evento e = cola_[ini_];
  ini_ = (ini_ + 1) % (sizeof(cola_) / sizeof(cola_[0]));
  n_--;
  return e;
}

void Botones::alPresionar(int i, uint32_t ms) {
  b_[i].presionMs = ms;
  if (i == ROJO) rojoLargoDisparado_ = false;
  if ((i == NEGRO || i == BLANCO) && b_[NEGRO].estable && b_[BLANCO].estable) {
    comboUsado_ = true;
    comboActivo_ = true;
    comboInicioMs_ = ms;
    sosDisparado_ = false;
  }
}

void Botones::alSoltar(int i, uint32_t ms) {
  (void)ms;
  if (i == ROJO) {
    if (!rojoLargoDisparado_) encolar(Evento::SELECCIONAR);
    return;
  }
  // NEGRO o BLANCO
  comboActivo_ = false;
  if (!comboUsado_) encolar(i == NEGRO ? Evento::ANTERIOR : Evento::SIGUIENTE);
  // La combinacion termina cuando se sueltan los dos
  if (!b_[NEGRO].estable && !b_[BLANCO].estable) comboUsado_ = false;
}

void Botones::actualizar(bool negro, bool blanco, bool rojo, uint32_t ms) {
  const bool crudo[3] = {negro, blanco, rojo};
  for (int i = 0; i < 3; i++) {
    Boton& b = b_[i];
    if (crudo[i] != b.crudo) {
      b.crudo = crudo[i];
      b.cambioMs = ms;
    }
    if (b.crudo != b.estable && ms - b.cambioMs >= t_.antirreboteMs) {
      b.estable = b.crudo;
      if (b.estable) alPresionar(i, ms);
      else alSoltar(i, ms);
    }
  }

  // ROJO largo: se dispara al cumplir el tiempo, sin esperar a soltar
  if (b_[ROJO].estable && !rojoLargoDisparado_ && ms - b_[ROJO].presionMs >= t_.rojoLargoMs) {
    rojoLargoDisparado_ = true;
    encolar(Evento::VOLVER);
  }

  // SOS: NEGRO + BLANCO sostenidos
  if (comboActivo_ && !sosDisparado_ && ms - comboInicioMs_ >= t_.sosMs) {
    sosDisparado_ = true;
    encolar(Evento::SOS);
  }
}

float Botones::progresoSos(uint32_t ms) const {
  if (!comboActivo_ || sosDisparado_) return -1.0f;
  float p = (float)(ms - comboInicioMs_) / (float)t_.sosMs;
  return p > 1.0f ? 1.0f : p;
}
