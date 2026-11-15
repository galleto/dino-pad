// historial.h - Historial circular de muestras de ambiente (temperatura y luz).
// C++ puro, sin Arduino (probado en la PC: test/verificar_historial.sh).
//
// Cada muestra lleva su hora real (epoch, segundos) tomada del rx_time del
// paquete. Solo se agregan muestras MAS NUEVAS que la ultima: asi el dato
// guardado que el tracker reenvia en cada reconexion no se duplica.
#pragma once
#include <stdint.h>

struct MuestraAmbiente {
  uint32_t epoch = 0;     // hora real de la medicion (s)
  bool tieneTemp = false;
  float temp = 0;         // C
  bool tieneLuz = false;
  float luz = 0;          // 0-100 (escala del firmware del T1000-E)
};

class HistorialAmbiente {
 public:
  static const int N = 60;   // a 1 muestra/min: la ultima hora

  // Agrega 'm' si es mas nueva que la ultima. Devuelve true si se agrego.
  bool agregar(const MuestraAmbiente& m) {
    if (n_ && m.epoch <= muestra(n_ - 1).epoch) return false;
    if (n_ < N) {
      m_[(ini_ + n_) % N] = m;
      n_++;
    } else {
      m_[ini_] = m;            // sobrescribe la mas vieja
      ini_ = (ini_ + 1) % N;
    }
    version_++;
    return true;
  }

  int cantidad() const { return n_; }
  // i = 0 es la mas vieja, cantidad()-1 la mas nueva
  const MuestraAmbiente& muestra(int i) const { return m_[(ini_ + i) % N]; }
  const MuestraAmbiente* ultima() const { return n_ ? &muestra(n_ - 1) : nullptr; }
  uint32_t version() const { return version_; }   // sube con cada muestra nueva

 private:
  MuestraAmbiente m_[N];
  uint8_t ini_ = 0, n_ = 0;
  uint32_t version_ = 0;
};
