// nodos.h - Lista de los otros nodos que el tracker conoce (para la pestana TRACK).
// C++ puro, sin Arduino (probado en la PC: test/verificar_nodos.sh).
//
// Por nodo solo se guarda: numero, nombre corto, saltos, ultima vez oido y si
// llego por MQTT. La POSICION de otros nodos no se guarda ni se muestra.
// Fuentes: NodeInfo (base de datos del tracker) y cada MeshPacket recibido.
#pragma once
#include <stdint.h>
#include <string.h>

struct NodoVisto {
  uint32_t num = 0;
  char corto[5] = "";        // user.short_name (hasta 4 caracteres)
  bool tieneSaltos = false;
  uint8_t saltos = 0;
  uint32_t lastHeard = 0;    // epoch (s) de la ultima vez oido; 0 = desconocido
  bool viaMqtt = false;
};

class ListaNodos {
 public:
  static const int N = 48;   // la base del tracker tenia ~43 nodos

  // Actualiza o agrega un nodo. 'corto' puede ser nullptr (no cambia el nombre).
  // Los saltos/mqtt solo se toman si la informacion no es mas vieja que la guardada.
  void actualizar(uint32_t num, const char* corto, bool tieneSaltos, uint8_t saltos,
                  uint32_t lastHeard, bool viaMqtt) {
    if (!num) return;
    int i = buscar(num);
    if (i < 0) {
      if (n_ < N) {
        i = n_++;
      } else {
        // Llena: reemplaza el oido hace mas tiempo, solo si el nuevo es mas reciente
        i = masViejo();
        if (lastHeard <= m_[i].lastHeard) return;
      }
      m_[i] = NodoVisto();
      m_[i].num = num;
    }
    NodoVisto& x = m_[i];
    if (corto && corto[0]) {
      strncpy(x.corto, corto, sizeof x.corto - 1);
      x.corto[sizeof x.corto - 1] = 0;
    }
    if (lastHeard >= x.lastHeard) {
      x.lastHeard = lastHeard;
      if (tieneSaltos) { x.tieneSaltos = true; x.saltos = saltos; }
      x.viaMqtt = viaMqtt;
    }
    version_++;
  }

  int cantidad() const { return n_; }
  const NodoVisto& nodo(int i) const { return m_[i]; }
  uint32_t version() const { return version_; }

  // Llena 'idx' con los indices ordenados del oido mas recientemente al mas viejo.
  int ordenados(uint8_t* idx) const {
    for (int i = 0; i < n_; i++) idx[i] = (uint8_t)i;
    for (int i = 1; i < n_; i++) {   // insercion: n <= 48
      uint8_t v = idx[i];
      int j = i - 1;
      while (j >= 0 && m_[idx[j]].lastHeard < m_[v].lastHeard) { idx[j + 1] = idx[j]; j--; }
      idx[j + 1] = v;
    }
    return n_;
  }

 private:
  int buscar(uint32_t num) const {
    for (int i = 0; i < n_; i++)
      if (m_[i].num == num) return i;
    return -1;
  }
  int masViejo() const {
    int k = 0;
    for (int i = 1; i < n_; i++)
      if (m_[i].lastHeard < m_[k].lastHeard) k = i;
    return k;
  }

  NodoVisto m_[N];
  uint8_t n_ = 0;
  uint32_t version_ = 0;
};
