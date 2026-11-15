// Prueba en la PC de botones.cpp: simula pulsaciones (1 ms por paso) y revisa
// los eventos. Uso: test/verificar_botones.sh
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "../botones.h"

struct Sim {
  Botones b;
  uint32_t ms = 1000;
  bool n = false, w = false, r = false;
  std::vector<std::pair<uint32_t, Evento>> eventos;

  void correr(uint32_t dur) {
    for (uint32_t i = 0; i < dur; i++, ms++) {
      b.actualizar(n, w, r, ms);
      for (Evento e; (e = b.siguienteEvento()) != Evento::NINGUNO;) eventos.push_back({ms, e});
    }
  }
  std::string lista() const {
    std::string s;
    for (auto& e : eventos) s += std::string(s.empty() ? "" : " ") + nombreEvento(e.second);
    return s.empty() ? "(ninguno)" : s;
  }
};

static int fallos = 0;
static void revisar(const char* caso, const Sim& s, const char* esperado) {
  std::string got = s.lista();
  bool ok = got == esperado;
  if (!ok) fallos++;
  printf("%-4s %-46s -> %s%s%s\n", ok ? "OK" : "FALLA", caso, got.c_str(),
         ok ? "" : "   esperado: ", ok ? "" : esperado);
}

int main() {
  { Sim s; s.correr(50); s.n = true; s.correr(100); s.n = false; s.correr(100);
    revisar("NEGRO corto", s, "ANTERIOR"); }
  { Sim s; s.w = true; s.correr(100); s.w = false; s.correr(100);
    revisar("BLANCO corto", s, "SIGUIENTE"); }
  { Sim s; s.r = true; s.correr(200); s.r = false; s.correr(100);
    revisar("ROJO corto (200 ms)", s, "SELECCIONAR"); }
  { Sim s; s.r = true; s.correr(1500); s.r = false; s.correr(100);
    revisar("ROJO largo (1.5 s): VOLVER y nada al soltar", s, "VOLVER"); }
  { Sim s; s.r = true; s.correr(900);
    bool antes = !s.eventos.empty() && s.eventos[0].first < 1000 + 900;
    revisar("ROJO largo dispara sin soltar", s, "VOLVER");
    if (!antes) { fallos++; printf("FALLA ROJO largo no se disparo antes de soltar\n"); } }
  { Sim s; s.n = s.w = true; s.correr(3500); s.n = s.w = false; s.correr(100);
    revisar("NEGRO+BLANCO 3.5 s: solo SOS", s, "SOS"); }
  { Sim s; s.n = s.w = true; s.correr(1000); s.n = s.w = false; s.correr(100);
    revisar("NEGRO+BLANCO 1 s: nada", s, "(ninguno)"); }
  { Sim s; s.n = true; s.correr(500); s.w = true; s.correr(2900);
    revisar("combo escalonado, 2.9 s tras BLANCO: aun nada", s, "(ninguno)");
    s.correr(200); s.n = s.w = false; s.correr(100);
    revisar("combo escalonado, 3.1 s tras BLANCO: SOS", s, "SOS"); }
  { Sim s; s.n = s.w = true; s.correr(5000); s.w = false; s.correr(100); s.n = false; s.correr(100);
    revisar("SOS sostenido 5 s: un solo SOS", s, "SOS"); }
  { Sim s;
    for (int i = 0; i < 6; i++) { s.n = !s.n; s.correr(5); }   // rebote de 30 ms
    s.n = true; s.correr(100); s.n = false; s.correr(100);
    revisar("NEGRO con rebote: un solo evento", s, "ANTERIOR"); }
  { Sim s; s.n = true; s.correr(20); s.n = false; s.correr(100);
    revisar("pulso de 20 ms (menor al antirrebote): nada", s, "(ninguno)"); }
  { Sim s; s.n = s.w = true; s.correr(1530);
    float p = s.b.progresoSos(s.ms);
    bool ok = std::fabs(p - 0.5f) < 0.02f;
    if (!ok) fallos++;
    printf("%-4s %-46s -> %.3f\n", ok ? "OK" : "FALLA", "progreso SOS a 1.5 s ~ 0.5", p); }
  { Sim s; s.w = true; s.correr(100); s.w = false; s.correr(50); s.r = true; s.correr(100);
    s.r = false; s.correr(50); s.n = true; s.correr(100); s.n = false; s.correr(100);
    revisar("secuencia BLANCO, ROJO, NEGRO", s, "SIGUIENTE SELECCIONAR ANTERIOR"); }

  printf("\n%s (%d fallo(s))\n", fallos ? "HAY FALLOS" : "TODO OK", fallos);
  return fallos ? 1 : 0;
}
