// vitales.h - Signos vitales para la pestana VITAL: semaforo e historial.
// C++ puro, sin Arduino (probado en la PC: test/verificar_vitales.sh).
//
// Rangos copiados de backend/data/crew.json ("ok" y "warn" de hr y spo2), con la
// misma regla de backend/rules.py: dentro de ok = normal, dentro de warn = atencion,
// fuera = critico. Si el equipo cambia crew.json, hay que cambiarlos aqui tambien.
#pragma once
#include <stdint.h>

enum class Semaforo : uint8_t { NORMAL, ATENCION, CRITICO };

struct RangoVital {
  float okMin, okMax, warnMin, warnMax;
};
static const RangoVital RANGO_HR   = {50, 90, 40, 110};   // lpm
static const RangoVital RANGO_SPO2 = {95, 100, 90, 100};  // %

inline Semaforo clasificar(float v, const RangoVital& r) {
  if (v >= r.okMin && v <= r.okMax) return Semaforo::NORMAL;
  if (v >= r.warnMin && v <= r.warnMax) return Semaforo::ATENCION;
  return Semaforo::CRITICO;
}

inline const char* nombreSemaforo(Semaforo s) {
  return s == Semaforo::NORMAL ? "NORMAL" : s == Semaforo::ATENCION ? "ATENCION" : "CRITICO";
}

struct MuestraVital {
  uint32_t ms = 0;     // millis() de la medicion
  uint8_t hr = 0;      // lpm
  uint8_t spo2 = 0;    // %
};

class HistorialVital {
 public:
  static const int N = 60;   // a 1 muestra cada 2 s: los ultimos 2 minutos

  void agregar(const MuestraVital& m) {
    if (n_ < N) {
      m_[(ini_ + n_) % N] = m;
      n_++;
    } else {
      m_[ini_] = m;
      ini_ = (ini_ + 1) % N;
    }
    version_++;
  }
  int cantidad() const { return n_; }
  const MuestraVital& muestra(int i) const { return m_[(ini_ + i) % N]; }   // 0 = la mas vieja
  const MuestraVital* ultima() const { return n_ ? &muestra(n_ - 1) : nullptr; }
  uint32_t version() const { return version_; }

 private:
  MuestraVital m_[N];
  uint8_t ini_ = 0, n_ = 0;
  uint32_t version_ = 0;
};

// Lo que dibuja la pestana VITAL
struct DatosVitales {
  HistorialVital historial;
  bool simulado = true;   // true: se muestra "DEMO" (no es una medicion real)
};
