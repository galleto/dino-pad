// Prueba en la PC de posicion_demo.h. Uso: test/verificar_posicion.sh
#include <cmath>
#include <cstdio>
#include <cstring>

#include "../posicion_demo.h"

using namespace posdemo;

static int fallos = 0;
static void revisar(const char* caso, bool ok) {
  if (!ok) fallos++;
  printf("%-4s %s\n", ok ? "OK" : "FALLA", caso);
}

int main() {
  revisar("base = Perseverance segun NASA GISS (18.44 N, 77.45 E)", BASE_LAT == 18.44 && BASE_LON == 77.45);

  // 1 grado de latitud en Marte = 2*pi*R/360 ~ 59.16 km
  double lat, lon;
  aGrados(59157.0f, 0, lat, lon);
  revisar("59.16 km al norte = +1 grado de latitud", std::fabs(lat - (BASE_LAT + 1.0)) < 0.001 && lon == BASE_LON);
  aGrados(0, 1000.0f, lat, lon);
  double esperado = 1000.0 / (RADIO_MARTE_M * std::cos(BASE_LAT * PI_D / 180.0)) * 180.0 / PI_D;
  revisar("1 km al este escala con cos(latitud)", std::fabs((lon - BASE_LON) - esperado) < 1e-9 && lat == BASE_LAT);

  revisar("rumbos", !strcmp(rumbo(100, 0), "N") && !strcmp(rumbo(0, 100), "E") && !strcmp(rumbo(-100, 0), "S") &&
                        !strcmp(rumbo(0, -100), "O") && !strcmp(rumbo(70, 70), "NE") && !strcmp(rumbo(-70, -70), "SO"));

  // Cada tripulante, en una hora: entre decenas y cientos de metros de la base
  for (int i = 0; i < N_TRIPULANTES; i++) {
    float dmin = 1e9f, dmax = 0, n, e;
    bool cambia = false;
    float n0, e0;
    desplazamiento(i, 0, n0, e0);
    for (uint32_t s = 0; s < 3600; s++) {
      desplazamiento(i, s, n, e);
      float d = distanciaM(n, e);
      if (d < dmin) dmin = d;
      if (d > dmax) dmax = d;
      if (n != n0 || e != e0) cambia = true;
    }
    char caso[96];
    snprintf(caso, sizeof caso, "%s: se mueve y queda entre 5 m y 1 km (%.0f-%.0f m)", TRIPULANTES[i].corto, dmin, dmax);
    revisar(caso, cambia && dmin >= 5 && dmax <= 1000);
    revisar("nombre corto de 4 caracteres", strlen(TRIPULANTES[i].corto) == 4);
  }

  printf("\n%s\n", fallos ? "HAY FALLOS" : "TODO OK");
  return fallos ? 1 : 0;
}
