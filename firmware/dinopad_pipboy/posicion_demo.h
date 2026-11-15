// posicion_demo.h - Coordenadas DEMO para la pestana TRACK (todas las constantes aqui).
// C++ puro, sin Arduino (probado en la PC: test/verificar_posicion.sh).
//
// Se usan SOLO mientras el T1000-E no tenga fix de GPS; la pantalla muestra "DEMO" en
// amarillo. Con fix real se muestra la posicion del GPS (rotulo "GPS") y esto se oculta.
// Nada de esto sale por radio ni se escribe en el tracker.
#pragma once
#include <math.h>
#include <stdint.h>

namespace posdemo {

// ---- Base: sitio de aterrizaje de Perseverance en el crater Jezero, Marte ----
// Fuente: NASA GISS, Mars24 "Mars Lander Missions"
//   https://www.giss.nasa.gov/tools/mars24/help/landers.html
//   Mars 2020: "landed Feb. 18, 2021, in Jezero Crater, at 77.45°E 18.44°N"
// (Octavia E. Butler Landing). Longitud ESTE, grados.
static const double BASE_LAT = 18.44;
static const double BASE_LON = 77.45;
static const char* const NOMBRE_BASE = "BASE JEZERO, MARTE";

// Radio medio volumetrico de Marte: NASA NSSDC Mars Fact Sheet, 3389.5 km
//   https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
static const double RADIO_MARTE_M = 3389500.0;

// ---- Tripulantes simulados: desplazamiento desde la base, en metros ----
// Posicion = (norte, este) + amplitud * sin(2*pi*t/periodo [+ desfase en el este]).
// crewId como en backend/data/crew.json.
struct Tripulante {
  const char* corto;     // 4 caracteres para la pantalla
  const char* crewId;
  float norteM, esteM;   // centro de su recorrido
  float ampNorteM, ampEsteM;
  uint32_t periodoS;     // una vuelta completa
};
static const Tripulante TRIPULANTES[] = {
    {"BOTA", "botanico", 40, -30, 30, 50, 600},     // decenas de metros (~10-110 m)
    {"INGE", "ingeniero", -40, 300, 25, 120, 900},  // cientos de metros (~180-420 m)
};
static const int N_TRIPULANTES = sizeof(TRIPULANTES) / sizeof(TRIPULANTES[0]);

// ---------------------------------------------------------------------------
static const double PI_D = 3.14159265358979323846;

// Desplazamiento (m) del tripulante i en el segundo s
inline void desplazamiento(int i, uint32_t s, float& norte, float& este) {
  const Tripulante& t = TRIPULANTES[i];
  float f = (float)(2.0 * PI_D * (double)(s % t.periodoS) / (double)t.periodoS);
  norte = t.norteM + t.ampNorteM * sinf(f);
  este = t.esteM + t.ampEsteM * sinf(f + 1.0f);
}

// Metros desde la base -> grados (aproximacion local, valida a pocos km)
inline void aGrados(float norte, float este, double& lat, double& lon) {
  lat = BASE_LAT + (norte / RADIO_MARTE_M) * 180.0 / PI_D;
  lon = BASE_LON + (este / (RADIO_MARTE_M * cos(BASE_LAT * PI_D / 180.0))) * 180.0 / PI_D;
}

inline float distanciaM(float norte, float este) { return sqrtf(norte * norte + este * este); }

// Rumbo desde la base en 8 direcciones (N, NE, E, SE, S, SO, O, NO)
inline const char* rumbo(float norte, float este) {
  static const char* const R[] = {"N", "NE", "E", "SE", "S", "SO", "O", "NO"};
  float g = atan2f(este, norte) * 180.0f / (float)PI_D;   // 0 = norte, 90 = este
  if (g < 0) g += 360.0f;
  return R[(int)((g + 22.5f) / 45.0f) % 8];
}

}  // namespace posdemo
