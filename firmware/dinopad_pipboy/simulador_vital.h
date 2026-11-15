// simulador_vital.h - BPM y SpO2 SIMULADOS para la pestana VITAL (la pantalla dice "DEMO").
// C++ puro, sin Arduino (probado en la PC: test/verificar_vitales.sh).
//
// Para cambiarlo por el sensor real (MAX30102): escribir una clase con el mismo
// metodo  bool leer(uint32_t ms, MuestraVital& out)  y poner DatosVitales::simulado = false.
//
// Comportamiento: reposo ~74 lpm / 98 %, con ruido e inercia como backend/simulator.
// Cada 3 minutos hay 30 s de "esfuerzo" (~104 lpm / 93 %) para que se vea el
// semaforo en ATENCION. Nunca simula valores criticos.
#pragma once
#include <math.h>
#include <stdint.h>

#include "vitales.h"

class SimuladorVital {
 public:
  static const uint32_t PERIODO_MS = 2000;   // cadenceMs de crew.json
  static const uint32_t CICLO_S = 180;       // cada 3 min...
  static const uint32_t ESFUERZO_DESDE_S = 120, ESFUERZO_HASTA_S = 150;   // ...30 s de esfuerzo

  // true si hay una muestra nueva en 'out' (una cada PERIODO_MS).
  bool leer(uint32_t ms, MuestraVital& out) {
    if (hay_ && ms - ultimoMs_ < PERIODO_MS) return false;
    hay_ = true;
    ultimoMs_ = ms;

    uint32_t s = ms / 1000;
    bool esfuerzo = (s % CICLO_S) >= ESFUERZO_DESDE_S && (s % CICLO_S) < ESFUERZO_HASTA_S;
    float objHr = esfuerzo ? 104.0f : 74.0f + 2.0f * sinf(s / 60.0f);
    float objSpo2 = esfuerzo ? 93.0f : 98.0f;
    hr_ += (objHr - hr_) * 0.25f + ruido(1.5f);
    spo2_ += (objSpo2 - spo2_) * 0.2f + ruido(0.3f);
    if (spo2_ > 100.0f) spo2_ = 100.0f;

    out.ms = ms;
    out.hr = (uint8_t)lroundf(acotar(hr_, 55.0f, 108.0f));     // nunca critico (40-110)
    out.spo2 = (uint8_t)lroundf(acotar(spo2_, 91.0f, 100.0f)); // nunca critico (>= 90)
    return true;
  }

 private:
  static float acotar(float v, float lo, float hi) { return v < lo ? lo : v > hi ? hi : v; }
  // Ruido uniforme en [-amp, amp] con un generador propio (repetible en la PC)
  float ruido(float amp) {
    semilla_ = semilla_ * 1664525u + 1013904223u;
    return ((semilla_ >> 8) / 16777216.0f - 0.5f) * 2.0f * amp;
  }

  bool hay_ = false;
  uint32_t ultimoMs_ = 0;
  float hr_ = 74.0f, spo2_ = 98.0f;
  uint32_t semilla_ = 12345;
};
