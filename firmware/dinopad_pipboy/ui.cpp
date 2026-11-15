// ui.cpp - ver ui.h
#include "ui.h"

#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <SPI.h>
#include <pines.h>

#include "mensajes.h"
#include "posicion_demo.h"

const char* const NOMBRES_PESTANA[N_PESTANAS] = {"ESTADO", "AMBIENTE", "TRACK", "VITAL", "MENS"};

// ===== COLORES (RGB565) =====
#define COL_FONDO     0x0000
#define COL_VERDE     0x07E0
#define COL_VERDE_OSC 0x0240
#define COL_VERDE_MED 0x03E0
#define COL_ROJO      0xF800
#define COL_BLANCO    0xFFFF
#define COL_AMARILLO  0xFFE0
#define COL_GRIS      0x8410
#define COL_NEGRO     0x0000

// ===== DISENO (320 x 240) =====
//   y 0-22     barra de titulo + indicador BLE
//   y 26-48    5 pestanas de 64 px
//   y 54-196   contenido de la pestana
//   y 200-210  barra de progreso del SOS (solo mientras se sostiene)
//   y 216-239  ultimo evento + leyenda de botones
#define Y_PESTANAS   26
#define ALTO_PESTANA 22
#define ANCHO_PEST   (TFT_ANCHO / N_PESTANAS)
#define Y_CONTENIDO  54
#define ALTO_CONT    142
#define Y_SOS_BARRA  200
#define Y_PIE        216

// Antiguedad a partir de la cual un dato se muestra en gris
static const uint32_t VIEJO_METRICAS_MS = 150000;   // DeviceMetrics llegan cada ~60 s
static const uint32_t VIEJO_RSSI_MS     = 15000;    // RSSI se lee cada 5 s conectado
static const uint32_t VIEJO_AMBIENTE_S  = 150;      // ambiente llega cada ~60 s (si esta activado)
static const uint32_t VENTANA_GRAFICA_S = 30 * 60;  // las graficas muestran los ultimos 30 min
static const uint32_t HUECO_GRAFICA_S   = 5 * 60;   // no unir puntos separados mas de 5 min
static const uint32_t VIEJO_POSICION_S  = 15 * 60;  // posicion propia en gris despues de 15 min
static const uint32_t NODO_RECIENTE_S   = 15 * 60;  // nodo oido hace menos: verde
static const uint32_t NODO_VIEJO_S      = 2 * 3600; // nodo oido hace mas: gris

static Adafruit_ILI9341 tft(PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST);

// ---------- Campos con cache (redibujar solo si cambian) ----------
struct Campo {
  char texto[28];
  uint16_t color;
  bool valido;   // false = hay que dibujarlo aunque no cambie
};
enum IdCampo {
  C_BLE_TITULO,
  // ESTADO: valor y antiguedad de cada fila
  C_EST_CONEXION, C_EST_CONEXION_E, C_EST_RSSI, C_EST_RSSI_E, C_EST_BAT, C_EST_BAT_E,
  C_EST_VOLT, C_EST_VOLT_E, C_EST_CANAL, C_EST_CANAL_E, C_EST_UPTIME, C_EST_UPTIME_E,
  C_EST_EXTRA,
  // AMBIENTE
  C_AMB_TEMP, C_AMB_TEMP_E, C_AMB_LUZ, C_AMB_LUZ_E,
  // TRACK
  C_TRK_POS, C_TRK_POS_E, C_TRK_DET, C_TRK_TITULO, C_TRK_ETIQ, C_TRK_FUENTE,
  // VITAL
  C_VIT_HR, C_VIT_HR_EST, C_VIT_SPO2, C_VIT_SPO2_EST, C_VIT_DEMO1, C_VIT_DEMO2, C_VIT_EDAD,
  // MENS (una fila por mensaje predeterminado)
  C_MEN_0, C_MEN_7 = C_MEN_0 + 7,
  N_CAMPOS
};
static Campo campos[N_CAMPOS];

// Graficas: se redibujan si llega una muestra nueva o pasa un minuto (para correrse)
static uint32_t graficaVersion = 0;
static uint32_t graficaMinuto = 0;
static bool graficaValida = false;

// Filas de la lista de nodos (TRACK): mas largas que un Campo, con su propia cache
static const int FILAS_TRACK = 8;
static const int ANCHO_FILA_TRACK = 50;   // caracteres de 6 px
struct FilaTrack {
  char texto[ANCHO_FILA_TRACK + 1];
  uint16_t color;
  bool valido;
};
static FilaTrack filasTrack[FILAS_TRACK];
static int paginaTrack = 0;
static int cursorMens = 0;
static bool demoAutomatico = false;   // el menu lo mueve demo.h (pulsaciones simuladas)
static bool eventoDeDemo = false;     // el ultimo evento lo genero demo.h

// Graficas de VITAL: se redibujan con cada muestra nueva
static uint32_t graficaVitalVersion = 0;
static bool graficaVitalValida = false;

static void invalidarCampos() {
  for (auto& c : campos) c.valido = false;
  for (auto& f : filasTrack) f.valido = false;
  graficaValida = false;
  graficaVitalValida = false;
}

// Dibuja 'texto' en (x,y) con fondo negro, rellenando hasta 'ancho' caracteres
// para borrar restos del valor anterior. Solo si cambio texto o color.
static void campo(IdCampo id, int x, int y, uint8_t tam, uint16_t color, int ancho, const char* texto,
                  uint16_t fondo = COL_FONDO) {
  Campo& c = campos[id];
  if (c.valido && c.color == color && strcmp(c.texto, texto) == 0) return;
  snprintf(c.texto, sizeof c.texto, "%s", texto);
  c.color = color;
  c.valido = true;
  char t[40];
  snprintf(t, sizeof t, "%-*.*s", ancho, ancho, texto);
  tft.setTextSize(tam);
  tft.setTextColor(color, fondo);
  tft.setCursor(x, y);
  tft.print(t);
}

static void textoCentrado(const char* s, int y, uint8_t tam, uint16_t color, uint16_t fondo) {
  tft.setTextSize(tam);
  tft.setTextColor(color, fondo);
  tft.setCursor((TFT_ANCHO - (int)strlen(s) * 6 * tam) / 2, y);
  tft.print(s);
}

// "12s", "3m", "2h" (antiguedad compacta, max 4 caracteres)
static void edad(char* buf, size_t n, uint32_t msDato, uint32_t ahora) {
  if (!msDato) { snprintf(buf, n, "--"); return; }
  uint32_t s = (ahora - msDato) / 1000;
  if (s < 100) snprintf(buf, n, "%lus", (unsigned long)s);
  else if (s < 6000) snprintf(buf, n, "%lum", (unsigned long)(s / 60));
  else snprintf(buf, n, "%luh", (unsigned long)(s / 3600));
}

static bool esViejo(uint32_t msDato, uint32_t ahora, uint32_t limite) {
  return !msDato || ahora - msDato > limite;
}

// ---------- Marco general ----------
namespace ui {

void iniciar() {
  tft.begin(TFT_SPI_FREQ);
  tft.fillScreen(COL_FONDO);
  tft.setRotation(TFT_ROTACION);
  uint8_t m = TFT_MADCTL;
  tft.sendCommand(0x36, &m, 1);   // justo despues de setRotation (ver pines.h)
  Serial.printf("Pantalla: setRotation(%u) + MADCTL 0x%02X -> %dx%d\n", TFT_ROTACION, TFT_MADCTL,
                tft.width(), tft.height());
}

static void titulo(Modo modo) {
  tft.fillRect(0, 0, TFT_ANCHO, 22, COL_VERDE_OSC);
  tft.drawFastHLine(0, 22, TFT_ANCHO, COL_VERDE);
  tft.setTextSize(2);
  tft.setTextColor(COL_VERDE, COL_VERDE_OSC);
  tft.setCursor(6, 4);
  tft.print("DINOPAD");
  tft.setTextSize(1);
  tft.setCursor(104, 8);
  tft.print(modo == Modo::DENTRO ? "DENTRO" : "MENU");
  if (demoAutomatico) {   // pulsaciones simuladas: siempre visible
    tft.fillRect(150, 5, 58, 13, COL_AMARILLO);
    tft.setTextColor(COL_NEGRO, COL_AMARILLO);
    tft.setCursor(152, 8);
    tft.print("DEMO AUTO");
  }
  campos[C_BLE_TITULO].valido = false;
}

static void pestanas(int sel) {
  for (int i = 0; i < N_PESTANAS; i++) {
    int x = i * ANCHO_PEST;
    bool s = i == sel;
    tft.fillRect(x, Y_PESTANAS, ANCHO_PEST, ALTO_PESTANA, s ? COL_VERDE : COL_FONDO);
    tft.drawRect(x, Y_PESTANAS, ANCHO_PEST, ALTO_PESTANA, COL_VERDE_MED);
    // Tamano 2 si cabe (<= 5 caracteres = 60 px), si no tamano 1
    uint8_t tam = strlen(NOMBRES_PESTANA[i]) <= 5 ? 2 : 1;
    int w = strlen(NOMBRES_PESTANA[i]) * 6 * tam;
    tft.setTextSize(tam);
    tft.setTextColor(s ? COL_FONDO : COL_VERDE, s ? COL_VERDE : COL_FONDO);
    tft.setCursor(x + (ANCHO_PEST - w) / 2, Y_PESTANAS + (tam == 2 ? 4 : 8));
    tft.print(NOMBRES_PESTANA[i]);
  }
}

static void marcoContenido(int pestana, Modo modo) {
  tft.fillRect(0, Y_CONTENIDO, TFT_ANCHO, ALTO_CONT, COL_FONDO);
  bool dentro = modo == Modo::DENTRO;
  tft.drawRect(2, Y_CONTENIDO, TFT_ANCHO - 4, ALTO_CONT, dentro ? COL_VERDE : COL_VERDE_OSC);
  if (dentro) tft.drawRect(3, Y_CONTENIDO + 1, TFT_ANCHO - 6, ALTO_CONT - 2, COL_VERDE);

  if (pestana == P_ESTADO) {
    // Etiquetas fijas de la pestana ESTADO (los valores los pone actualizar())
    static const char* ETIQ[] = {"CONEXION", "RSSI", "BATERIA", "VOLTAJE", "CANAL", "UPTIME"};
    tft.setTextSize(1);
    tft.setTextColor(COL_GRIS, COL_FONDO);
    for (int i = 0; i < 6; i++) {
      tft.setCursor(10, Y_CONTENIDO + 10 + i * 20);
      tft.print(ETIQ[i]);
    }
  } else if (pestana == P_AMBIENTE) {
    // Dos columnas: TEMP AMBIENTE (x=6) y LUZ (x=164), cada una con valor y grafica
    tft.setTextSize(1);
    tft.setTextColor(COL_GRIS, COL_FONDO);
    tft.setCursor(6, Y_CONTENIDO + 5);
    tft.print("TEMP AMBIENTE");
    tft.setCursor(164, Y_CONTENIDO + 5);
    tft.print("LUZ (0-100)");
    tft.setTextColor(COL_VERDE_OSC, COL_FONDO);
    tft.setCursor(104, Y_CONTENIDO + 5);
    tft.print("30min");
    tft.setCursor(262, Y_CONTENIDO + 5);
    tft.print("30min");
  } else if (pestana == P_TRACK) {
    // Arriba la posicion propia, abajo la lista de nodos (los valores los pone actualizar())
    tft.setTextSize(1);
    tft.setTextColor(COL_GRIS, COL_FONDO);
    tft.drawFastHLine(6, Y_CONTENIDO + 47, TFT_ANCHO - 12, COL_VERDE_OSC);
    tft.setCursor(8, Y_CONTENIDO + 52);
    tft.print("NOMB ID         SALTOS  OIDO");
  } else if (pestana == P_VITAL) {
    tft.setTextSize(1);
    tft.setTextColor(COL_GRIS, COL_FONDO);
    tft.setCursor(6, Y_CONTENIDO + 5);
    tft.print("BPM");
    tft.setCursor(164, Y_CONTENIDO + 5);
    tft.print("SpO2");
    tft.setTextColor(COL_VERDE_OSC, COL_FONDO);
    tft.setCursor(60, Y_CONTENIDO + 30);
    tft.print("lpm");
    tft.setCursor(218, Y_CONTENIDO + 30);
    tft.print("%");
    tft.setCursor(134, Y_CONTENIDO + 5);
    tft.print("2min");
    tft.setCursor(292, Y_CONTENIDO + 5);
    tft.print("2min");
  }
  // MENS: las filas las pone actualizar()
}

void pie(const char* evento) {
  tft.fillRect(0, Y_PIE - 2, TFT_ANCHO, TFT_ALTO - Y_PIE + 2, COL_FONDO);
  tft.drawFastHLine(0, Y_PIE - 3, TFT_ANCHO, COL_VERDE_OSC);
  tft.setTextSize(1);
  tft.setTextColor(COL_AMARILLO, COL_FONDO);
  tft.setCursor(6, Y_PIE);
  if (eventoDeDemo) tft.printf("Ultimo DEMO: %.37s", evento);
  else tft.printf("Ultimo: %.42s", evento);
  tft.setTextColor(COL_VERDE_MED, COL_FONDO);
  tft.setCursor(6, Y_PIE + 12);
  tft.print("NEG:<  BLA:>  ROJO:ok/largo volver  NEG+BLA 3s:SOS");   // 48 car. = 288 px
}

void ponerDemoAutomatico(bool activo) { demoAutomatico = activo; }
void origenEventoDemo(bool desdeDemo) { eventoDeDemo = desdeDemo; }

void dibujarTodo(int pestana, Modo modo, const char* evento) {
  tft.fillScreen(COL_FONDO);
  invalidarCampos();
  titulo(modo);
  pestanas(pestana);
  marcoContenido(pestana, modo);
  pie(evento);
}

void cambioDePestana(int pestana, Modo modo) {
  invalidarCampos();
  titulo(modo);
  pestanas(pestana);
  marcoContenido(pestana, modo);
}

// ---------- Contenido ----------
static uint16_t colorBateria(const DatosTracker& d) {
  if (d.bateria > 100) return COL_VERDE;   // 101 = USB (firmware Meshtastic)
  if (d.bateria >= 50) return COL_VERDE;
  if (d.bateria >= 20) return COL_AMARILLO;
  return COL_ROJO;
}

// Umbrales aproximados para una bateria LiPo de 1 celda
static uint16_t colorVoltaje(float v) {
  if (v >= 3.80f) return COL_VERDE;
  if (v >= 3.60f) return COL_AMARILLO;
  return COL_ROJO;
}

static uint16_t colorRssi(int r) {
  if (r >= -70) return COL_VERDE;
  if (r >= -85) return COL_AMARILLO;
  return COL_ROJO;
}

static uint16_t colorCanal(float pct) {
  if (pct < 25.0f) return COL_VERDE;
  if (pct < 50.0f) return COL_AMARILLO;
  return COL_ROJO;
}

static uint16_t colorEstado(EstadoBle e) {
  switch (e) {
    case EstadoBle::CONECTADO:    return COL_VERDE;
    case EstadoBle::DESCONECTADO: return COL_ROJO;
    default:                      return COL_AMARILLO;
  }
}

// Fila de la pestana ESTADO: valor (tamano 2, x=90, 14 caracteres) + antiguedad (x=270)
static void fila(int i, IdCampo idValor, IdCampo idEdad, const char* valor, uint16_t color,
                 const char* textoEdad, uint16_t colorEdad) {
  int y = Y_CONTENIDO + 6 + i * 20;
  campo(idValor, 90, y, 2, color, 14, valor);
  campo(idEdad, 270, y + 4, 1, colorEdad, 7, textoEdad);
}

static void contenidoEstado(const Compartido& c, uint32_t ahora) {
  const DatosTracker& d = c.datos;
  char v[32], e[12];

  // Conexion
  if (c.estado == EstadoBle::DESCONECTADO && c.reintentoMs) {
    long falta = (long)(c.reintentoMs - ahora) / 1000;
    snprintf(v, sizeof v, "DESCONEC. %lds", falta > 0 ? falta : 0L);
  } else {
    snprintf(v, sizeof v, "%s", nombreEstadoBle(c.estado));
  }
  edad(e, sizeof e, c.msEstado, ahora);
  fila(0, C_EST_CONEXION, C_EST_CONEXION_E, v, colorEstado(c.estado), e, COL_GRIS);

  // RSSI
  if (c.tieneRssi) {
    bool viejo = esViejo(c.msRssi, ahora, VIEJO_RSSI_MS);
    snprintf(v, sizeof v, "%d dBm", c.rssi);
    edad(e, sizeof e, c.msRssi, ahora);
    fila(1, C_EST_RSSI, C_EST_RSSI_E, v, viejo ? COL_GRIS : colorRssi(c.rssi), e, COL_GRIS);
  } else {
    fila(1, C_EST_RSSI, C_EST_RSSI_E, "sin dato", COL_GRIS, "", COL_GRIS);
  }

  // Metricas del dispositivo: gris si son viejas o si son las "guardadas" del NodeInfo
  bool metricasViejas = d.metricasGuardadas || esViejo(d.msMetricas, ahora, VIEJO_METRICAS_MS);
  if (d.metricasGuardadas) snprintf(e, sizeof e, "guard.");
  else edad(e, sizeof e, d.msMetricas, ahora);

  if (d.tieneBateria) {
    if (d.bateria > 100) snprintf(v, sizeof v, "USB");
    else snprintf(v, sizeof v, "%lu %%", (unsigned long)d.bateria);
    fila(2, C_EST_BAT, C_EST_BAT_E, v, metricasViejas ? COL_GRIS : colorBateria(d), e, COL_GRIS);
  } else {
    fila(2, C_EST_BAT, C_EST_BAT_E, "sin dato", COL_GRIS, "", COL_GRIS);
  }

  if (d.tieneVoltaje) {
    snprintf(v, sizeof v, "%.2f V", d.voltaje);
    fila(3, C_EST_VOLT, C_EST_VOLT_E, v, metricasViejas ? COL_GRIS : colorVoltaje(d.voltaje), e, COL_GRIS);
  } else {
    fila(3, C_EST_VOLT, C_EST_VOLT_E, "sin dato", COL_GRIS, "", COL_GRIS);
  }

  if (d.tieneUsoCanal) {
    if (d.tieneAirTx) snprintf(v, sizeof v, "%.1f%% tx%.1f%%", d.usoCanal, d.airTx);
    else snprintf(v, sizeof v, "%.1f %%", d.usoCanal);
    fila(4, C_EST_CANAL, C_EST_CANAL_E, v, metricasViejas ? COL_GRIS : colorCanal(d.usoCanal), e, COL_GRIS);
  } else {
    fila(4, C_EST_CANAL, C_EST_CANAL_E, "sin dato", COL_GRIS, "", COL_GRIS);
  }

  if (d.tieneUptime) {
    uint32_t up = d.uptime;
    if (up >= 86400) snprintf(v, sizeof v, "%lud %luh", (unsigned long)(up / 86400), (unsigned long)((up / 3600) % 24));
    else snprintf(v, sizeof v, "%luh %02lum", (unsigned long)(up / 3600), (unsigned long)((up / 60) % 60));
    fila(5, C_EST_UPTIME, C_EST_UPTIME_E, v, metricasViejas ? COL_GRIS : COL_BLANCO, e, COL_GRIS);
  } else {
    fila(5, C_EST_UPTIME, C_EST_UPTIME_E, "sin dato", COL_GRIS, "", COL_GRIS);
  }

  // Linea extra: nodo y motivo de la ultima desconexion
  if (c.estado == EstadoBle::DESCONECTADO && c.motivo[0]) snprintf(v, sizeof v, "%.27s", c.motivo);
  else if (d.tieneUsuario) snprintf(v, sizeof v, "%.12s (%s) con:%lu", d.nombreLargo, d.nombreCorto,
                                    (unsigned long)c.conexiones);
  else snprintf(v, sizeof v, "conexiones: %lu", (unsigned long)c.conexiones);
  campo(C_EST_EXTRA, 10, Y_CONTENIDO + 128, 1, c.estado == EstadoBle::DESCONECTADO ? COL_ROJO : COL_VERDE_MED,
        27, v);
}

// ---------- AMBIENTE ----------
// "12s"/"3m"/"2h" a partir de segundos
static void edadSegundos(char* buf, size_t n, uint32_t s) {
  if (s < 100) snprintf(buf, n, "%lus", (unsigned long)s);
  else if (s < 6000) snprintf(buf, n, "%lum", (unsigned long)(s / 60));
  else snprintf(buf, n, "%luh", (unsigned long)(s / 3600));
}

static void textoEnCaja(int x, int w, int y, uint16_t color, const char* s) {
  tft.setTextSize(1);
  tft.setTextColor(color, COL_FONDO);
  tft.setCursor(x + (w - (int)strlen(s) * 6) / 2, y);
  tft.print(s);
}

// Grafica de los ultimos VENTANA_GRAFICA_S segundos. esLuz: escala fija 0-100.
static void grafica(int x, int y, int w, int h, const HistorialAmbiente& hist, bool esLuz,
                    uint32_t ahoraEpoch, uint16_t color, const char* vacio) {
  tft.fillRect(x + 1, y + 1, w - 2, h - 2, COL_FONDO);
  tft.drawRect(x, y, w, h, COL_VERDE_OSC);

  // Muestras dentro de la ventana que tengan el valor pedido
  float vmin = 1e9f, vmax = -1e9f;
  int n = 0;
  for (int i = 0; i < hist.cantidad(); i++) {
    const MuestraAmbiente& m = hist.muestra(i);
    bool tiene = esLuz ? m.tieneLuz : m.tieneTemp;
    if (!tiene || m.epoch + VENTANA_GRAFICA_S < ahoraEpoch || m.epoch > ahoraEpoch + 60) continue;
    float v = esLuz ? m.luz : m.temp;
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
    n++;
  }
  if (!n) {
    textoEnCaja(x, w, y + h / 2 - 4, COL_GRIS, vacio);
    return;
  }
  if (esLuz) {
    vmin = 0;
    vmax = 100;
  } else if (vmax - vmin < 2.0f) {   // escala minima de 2 C para no exagerar el ruido
    float mid = (vmax + vmin) / 2;
    vmin = mid - 1.0f;
    vmax = mid + 1.0f;
  }

  char t[12];
  snprintf(t, sizeof t, esLuz ? "%.0f" : "%.1f", vmax);
  tft.setTextSize(1);
  tft.setTextColor(COL_VERDE_MED, COL_FONDO);
  tft.setCursor(x + 3, y + 3);
  tft.print(t);
  snprintf(t, sizeof t, esLuz ? "%.0f" : "%.1f", vmin);
  tft.setCursor(x + 3, y + h - 10);
  tft.print(t);

  int px0 = 0, py0 = 0;
  uint32_t e0 = 0;
  bool hayPrevio = false;
  for (int i = 0; i < hist.cantidad(); i++) {
    const MuestraAmbiente& m = hist.muestra(i);
    bool tiene = esLuz ? m.tieneLuz : m.tieneTemp;
    if (!tiene || m.epoch + VENTANA_GRAFICA_S < ahoraEpoch || m.epoch > ahoraEpoch + 60) continue;
    float v = esLuz ? m.luz : m.temp;
    uint32_t atras = ahoraEpoch > m.epoch ? ahoraEpoch - m.epoch : 0;
    int px = x + w - 3 - (int)((long)(w - 6) * (long)atras / (long)VENTANA_GRAFICA_S);
    int py = y + h - 3 - (int)((h - 6) * (v - vmin) / (vmax - vmin));
    if (hayPrevio && m.epoch - e0 <= HUECO_GRAFICA_S) tft.drawLine(px0, py0, px, py, color);
    tft.fillRect(px - 1, py - 1, 3, 3, color);
    px0 = px; py0 = py; e0 = m.epoch;
    hayPrevio = true;
  }
}

static void contenidoAmbiente(const Compartido& c, uint32_t ahora) {
  const DatosTracker& d = c.datos;
  uint32_t ahoraEpoch = epochEstimado(d, ahora);
  bool desactivado = d.tieneCfgTelemetria && !d.ambienteActivado;
  // Valor: max 8 caracteres en tamano 2. Grafica: hasta 24 en tamano 1.
  const char* sinDato = desactivado ? "apagado" : "sin dato";
  const char* sinDatoGrafica = desactivado ? "desactivado en tracker" : "sin dato";

  // Antiguedad de la ultima medicion: por hora real si se conoce, si no por millis()
  uint32_t edadS = 0;
  bool conocida = false;
  if (d.epochAmbiente && ahoraEpoch) {
    edadS = ahoraEpoch > d.epochAmbiente ? ahoraEpoch - d.epochAmbiente : 0;
    conocida = true;
  } else if (d.msAmbiente) {
    edadS = (ahora - d.msAmbiente) / 1000;
    conocida = true;
  }
  bool viejo = !conocida || edadS > VIEJO_AMBIENTE_S;
  char v[24], e[12];
  if (conocida) edadSegundos(e, sizeof e, edadS);
  else snprintf(e, sizeof e, "--");

  int yValor = Y_CONTENIDO + 18;
  if (d.tieneTemperatura) {
    snprintf(v, sizeof v, "%.1f C", d.temperatura);
    campo(C_AMB_TEMP, 6, yValor, 2, viejo ? COL_GRIS : COL_AMARILLO, 8, v);
    campo(C_AMB_TEMP_E, 116, yValor + 4, 1, COL_GRIS, 6, e);
  } else {
    campo(C_AMB_TEMP, 6, yValor, 2, COL_GRIS, 8, sinDato);
    campo(C_AMB_TEMP_E, 116, yValor + 4, 1, COL_GRIS, 6, "");
  }
  if (d.tieneLuz) {
    snprintf(v, sizeof v, "%.0f /100", d.luz);
    campo(C_AMB_LUZ, 164, yValor, 2, viejo ? COL_GRIS : COL_BLANCO, 8, v);
    campo(C_AMB_LUZ_E, 274, yValor + 4, 1, COL_GRIS, 6, e);
  } else {
    campo(C_AMB_LUZ, 164, yValor, 2, COL_GRIS, 8, sinDato);
    campo(C_AMB_LUZ_E, 274, yValor + 4, 1, COL_GRIS, 6, "");
  }

  // Graficas: solo si hay muestra nueva, cambio el minuto o se invalido la pantalla
  uint32_t minuto = (ahoraEpoch ? ahoraEpoch : ahora / 1000) / 60;
  if (!graficaValida || graficaVersion != d.historial.version() || graficaMinuto != minuto) {
    uint32_t ref = ahoraEpoch;
    if (!ref && d.historial.ultima()) ref = d.historial.ultima()->epoch;   // sin reloj: la ultima = ahora
    uint16_t colT = viejo ? COL_GRIS : COL_AMARILLO;
    uint16_t colL = viejo ? COL_GRIS : COL_BLANCO;
    int yG = Y_CONTENIDO + 40;
    grafica(6, yG, 150, ALTO_CONT - 44, d.historial, false, ref, colT, sinDatoGrafica);
    grafica(164, yG, 150, ALTO_CONT - 44, d.historial, true, ref, colL, sinDatoGrafica);
    graficaVersion = d.historial.version();
    graficaMinuto = minuto;
    graficaValida = true;
  }
}

// ---------- TRACK ----------
// Sin fix de GPS se usan las coordenadas DEMO (posicion_demo.h): la base y, en las
// primeras filas de la lista, los tripulantes simulados.
static bool posicionDemo(const DatosTracker& d) { return !d.tienePosicion; }

static int filasNodos(const DatosTracker& d) {
  return posicionDemo(d) ? FILAS_TRACK - posdemo::N_TRIPULANTES : FILAS_TRACK;
}

static int paginasTrack(const DatosTracker& d) {
  int n = d.nodos.cantidad(), f = filasNodos(d);
  return n ? (n + f - 1) / f : 1;
}

static void filaTrack(int i, uint16_t color, const char* texto) {
  FilaTrack& f = filasTrack[i];
  if (f.valido && f.color == color && strcmp(f.texto, texto) == 0) return;
  snprintf(f.texto, sizeof f.texto, "%s", texto);
  f.color = color;
  f.valido = true;
  char t[ANCHO_FILA_TRACK + 1];
  snprintf(t, sizeof t, "%-*.*s", ANCHO_FILA_TRACK, ANCHO_FILA_TRACK, texto);
  tft.setTextSize(1);
  tft.setTextColor(color, COL_FONDO);
  tft.setCursor(8, Y_CONTENIDO + 64 + i * 10);
  tft.print(t);
}

static const char* textoGps(const DatosTracker& d) {
  if (!d.tieneCfgPosicion) return "";
  switch (d.gpsMode) {   // meshtastic_Config_PositionConfig_GpsMode
    case 0:  return "GPS off";
    case 1:  return "GPS on";
    case 2:  return "sin GPS";
    default: return "GPS ?";
  }
}

static void contenidoTrack(const Compartido& c, uint32_t ahora) {
  const DatosTracker& d = c.datos;
  uint32_t ahoraEpoch = epochEstimado(d, ahora);
  char v[40], e[12];

  // Posicion propia. Antiguedad por la hora del GPS si se conoce, si no por millis()
  bool demo = posicionDemo(d);
  campo(C_TRK_ETIQ, 8, Y_CONTENIDO + 5, 1, COL_GRIS, 19, demo ? posdemo::NOMBRE_BASE : "POSICION PROPIA");
  campo(C_TRK_FUENTE, 128, Y_CONTENIDO + 5, 1, COL_NEGRO, 4, demo ? "DEMO" : "GPS",
        demo ? COL_AMARILLO : COL_VERDE);
  if (!demo) {
    uint32_t edadS;
    if (d.epochPosicion && ahoraEpoch) edadS = ahoraEpoch > d.epochPosicion ? ahoraEpoch - d.epochPosicion : 0;
    else edadS = (ahora - d.msPosicion) / 1000;
    bool viejo = edadS > VIEJO_POSICION_S;
    snprintf(v, sizeof v, "%.5f %.5f", d.latitudI * 1e-7, d.longitudI * 1e-7);
    campo(C_TRK_POS, 8, Y_CONTENIDO + 17, 2, viejo ? COL_GRIS : COL_VERDE, 21, v);
    edadSegundos(e, sizeof e, edadS);
    campo(C_TRK_POS_E, 270, Y_CONTENIDO + 5, 1, COL_GRIS, 7, e);
    int n = snprintf(v, sizeof v, "sats %lu", (unsigned long)d.satelites);
    if (d.tieneAltitud) n += snprintf(v + n, sizeof v - n, "  alt %ld m", (long)d.altitud);
    snprintf(v + n, sizeof v - n, "  %s", textoGps(d));
    campo(C_TRK_DET, 8, Y_CONTENIDO + 36, 1, COL_VERDE_MED, 27, v);
  } else {
    // Coordenadas fijas de la base DEMO + por que no hay posicion real
    snprintf(v, sizeof v, "%.5f %.5f", posdemo::BASE_LAT, posdemo::BASE_LON);
    campo(C_TRK_POS, 8, Y_CONTENIDO + 17, 2, COL_AMARILLO, 21, v);
    campo(C_TRK_POS_E, 270, Y_CONTENIDO + 5, 1, COL_GRIS, 7, "fija");
    const char* motivo = !d.tieneCfgPosicion ? "GPS: sin dato" : d.gpsMode == 0 ? "GPS apagado" :
                         d.gpsMode == 2 ? "sin GPS" : "GPS sin fix";
    snprintf(v, sizeof v, "%s: usando DEMO", motivo);
    campo(C_TRK_DET, 8, Y_CONTENIDO + 36, 1, COL_VERDE_MED, 27, v);
  }

  // Lista de nodos, del oido mas recientemente al mas viejo, por paginas
  int paginas = paginasTrack(d);
  if (paginaTrack >= paginas) paginaTrack = paginas - 1;
  snprintf(v, sizeof v, "%u nodos  %d/%d", (unsigned)d.nodos.cantidad(), paginaTrack + 1, paginas);
  campo(C_TRK_TITULO, 200, Y_CONTENIDO + 52, 1, COL_VERDE_MED, 18, v);

  // Tripulantes simulados (solo con coordenadas DEMO): primeras filas, en amarillo
  int fila0 = 0;
  if (demo) {
    uint32_t s = ahora / 1000;
    for (int t = 0; t < posdemo::N_TRIPULANTES; t++) {
      float no, es;
      double la, lo;
      posdemo::desplazamiento(t, s, no, es);
      posdemo::aGrados(no, es, la, lo);
      char fila[72];
      snprintf(fila, sizeof fila, "%-4s %.5f %.5f %4.0fm %-2s DEMO", posdemo::TRIPULANTES[t].corto, la, lo,
               posdemo::distanciaM(no, es), posdemo::rumbo(no, es));
      filaTrack(t, COL_AMARILLO, fila);
    }
    fila0 = posdemo::N_TRIPULANTES;
  }

  static uint8_t idx[ListaNodos::N];
  int n = d.nodos.ordenados(idx);
  int porPagina = filasNodos(d);
  for (int i = fila0; i < FILAS_TRACK; i++) {
    int k = paginaTrack * porPagina + (i - fila0);
    if (k >= n) {
      filaTrack(i, COL_GRIS, (k == 0) ? "sin nodos todavia" : "");
      continue;
    }
    const NodoVisto& x = d.nodos.nodo(idx[k]);
    char saltos[10];
    if (x.tieneSaltos) snprintf(saltos, sizeof saltos, "%u", (unsigned)x.saltos);
    else snprintf(saltos, sizeof saltos, "?");
    uint16_t color = COL_GRIS;
    if (x.lastHeard && ahoraEpoch) {
      uint32_t s = ahoraEpoch > x.lastHeard ? ahoraEpoch - x.lastHeard : 0;
      edadSegundos(e, sizeof e, s);
      color = s < NODO_RECIENTE_S ? COL_VERDE : s < NODO_VIEJO_S ? COL_VERDE_MED : COL_GRIS;
    } else {
      snprintf(e, sizeof e, "--");
    }
    char fila[72];
    snprintf(fila, sizeof fila, "%-4s !%08lx  %-6s  %-5s%s", x.corto[0] ? x.corto : "?", (unsigned long)x.num,
             saltos, e, x.viaMqtt ? " MQTT" : "");
    filaTrack(i, color, fila);
  }
}


// ---------- VITAL ----------
static uint16_t colorSemaforo(Semaforo s) {
  return s == Semaforo::NORMAL ? COL_VERDE : s == Semaforo::ATENCION ? COL_AMARILLO : COL_ROJO;
}

static const uint32_t VENTANA_VITAL_MS = 120000;   // las graficas muestran los ultimos 2 min

// Grafica de un signo vital con escala fija y lineas en los limites del rango normal.
static void graficaVital(int x, int y, int w, int h, const HistorialVital& hist, bool esSpo2,
                         const RangoVital& r, float vmin, float vmax, uint32_t ahora) {
  tft.fillRect(x + 1, y + 1, w - 2, h - 2, COL_FONDO);
  tft.drawRect(x, y, w, h, COL_VERDE_OSC);
  auto yDe = [&](float v) {
    if (v < vmin) v = vmin;
    if (v > vmax) v = vmax;
    return y + h - 3 - (int)((h - 6) * (v - vmin) / (vmax - vmin));
  };
  // Limites del rango normal (punteados)
  for (float lim : {r.okMin, r.okMax}) {
    if (lim <= vmin || lim >= vmax) continue;
    int yl = yDe(lim);
    for (int px = x + 2; px < x + w - 2; px += 4) tft.drawPixel(px, yl, COL_VERDE_MED);
  }
  char t[8];
  tft.setTextSize(1);
  tft.setTextColor(COL_VERDE_MED, COL_FONDO);
  snprintf(t, sizeof t, "%.0f", vmax);
  tft.setCursor(x + 3, y + 3);
  tft.print(t);
  snprintf(t, sizeof t, "%.0f", vmin);
  tft.setCursor(x + 3, y + h - 10);
  tft.print(t);

  int px0 = 0, py0 = 0;
  bool hayPrevio = false;
  for (int i = 0; i < hist.cantidad(); i++) {
    const MuestraVital& m = hist.muestra(i);
    uint32_t atras = ahora - m.ms;
    if (atras > VENTANA_VITAL_MS) continue;
    float v = esSpo2 ? m.spo2 : m.hr;
    int px = x + w - 3 - (int)((long)(w - 6) * (long)atras / (long)VENTANA_VITAL_MS);
    int py = yDe(v);
    uint16_t col = colorSemaforo(clasificar(v, r));
    if (hayPrevio) tft.drawLine(px0, py0, px, py, col);
    px0 = px; py0 = py;
    hayPrevio = true;
  }
}

static void contenidoVital(const DatosVitales& vit, uint32_t ahora) {
  const MuestraVital* m = vit.historial.ultima();
  // Aviso de datos simulados, siempre visible mientras lo sean
  campo(C_VIT_DEMO1, 100, Y_CONTENIDO + 5, 1, COL_NEGRO, 4, vit.simulado ? "DEMO" : "", vit.simulado ? COL_AMARILLO : COL_FONDO);
  campo(C_VIT_DEMO2, 258, Y_CONTENIDO + 5, 1, COL_NEGRO, 4, vit.simulado ? "DEMO" : "", vit.simulado ? COL_AMARILLO : COL_FONDO);
  if (!m) {
    campo(C_VIT_HR, 6, Y_CONTENIDO + 16, 3, COL_GRIS, 3, "--");
    campo(C_VIT_SPO2, 164, Y_CONTENIDO + 16, 3, COL_GRIS, 3, "--");
    campo(C_VIT_HR_EST, 90, Y_CONTENIDO + 22, 1, COL_GRIS, 8, "sin dato");
    campo(C_VIT_SPO2_EST, 248, Y_CONTENIDO + 22, 1, COL_GRIS, 8, "sin dato");
    return;
  }
  char v[8];
  Semaforo sh = clasificar(m->hr, RANGO_HR), ss = clasificar(m->spo2, RANGO_SPO2);
  snprintf(v, sizeof v, "%u", (unsigned)m->hr);
  campo(C_VIT_HR, 6, Y_CONTENIDO + 16, 3, colorSemaforo(sh), 3, v);
  campo(C_VIT_HR_EST, 90, Y_CONTENIDO + 22, 1, colorSemaforo(sh), 8, nombreSemaforo(sh));
  snprintf(v, sizeof v, "%u", (unsigned)m->spo2);
  campo(C_VIT_SPO2, 164, Y_CONTENIDO + 16, 3, colorSemaforo(ss), 3, v);
  campo(C_VIT_SPO2_EST, 248, Y_CONTENIDO + 22, 1, colorSemaforo(ss), 8, nombreSemaforo(ss));

  if (!graficaVitalValida || graficaVitalVersion != vit.historial.version()) {
    int yG = Y_CONTENIDO + 44;
    graficaVital(6, yG, 150, ALTO_CONT - 48, vit.historial, false, RANGO_HR, 40, 120, ahora);
    graficaVital(164, yG, 150, ALTO_CONT - 48, vit.historial, true, RANGO_SPO2, 85, 100, ahora);
    graficaVitalVersion = vit.historial.version();
    graficaVitalValida = true;
  }
}

// ---------- MENS ----------
static void contenidoMens(Modo modo) {
  bool dentro = modo == Modo::DENTRO;
  char t[28];
  for (int i = 0; i < N_MENSAJES; i++) {
    bool sel = dentro && i == cursorMens;
    snprintf(t, sizeof t, "%c%s", sel ? '>' : ' ', MENSAJES_PREDETERMINADOS[i]);
    campo((IdCampo)(C_MEN_0 + i), 8, Y_CONTENIDO + 6 + i * 16, 2, sel ? COL_NEGRO : COL_VERDE, 25, t,
          sel ? COL_VERDE : COL_FONDO);
  }
}

void moverCursorMens(int delta) { cursorMens = (cursorMens + N_MENSAJES + delta) % N_MENSAJES; }
const char* mensajeSeleccionado() { return MENSAJES_PREDETERMINADOS[cursorMens]; }
void elegirMensaje(int i) { if (i >= 0 && i < N_MENSAJES) cursorMens = i; }

void moverPaginaTrack(int delta) {
  paginaTrack += delta;
  if (paginaTrack < 0) paginaTrack = 0;   // el tope superior se ajusta en contenidoTrack
}

void reiniciarPaginaTrack() { paginaTrack = 0; }

void actualizar(int pestana, Modo modo, const Compartido& c, const DatosVitales& v, uint32_t ahora) {
  if (modo == Modo::SOS) return;

  // Indicador BLE en la barra de titulo (todas las pestanas)
  char t[20];
  snprintf(t, sizeof t, "BLE %s", c.estado == EstadoBle::CONECTADO ? "OK" :
                                  c.estado == EstadoBle::DESCONECTADO ? "--" : "..");
  campo(C_BLE_TITULO, 262, 8, 1, colorEstado(c.estado), 9, t, COL_VERDE_OSC);

  if (pestana == P_ESTADO) contenidoEstado(c, ahora);
  else if (pestana == P_AMBIENTE) contenidoAmbiente(c, ahora);
  else if (pestana == P_TRACK) contenidoTrack(c, ahora);
  else if (pestana == P_VITAL) contenidoVital(v, ahora);
  else if (pestana == P_MENS) contenidoMens(modo);
}

// ---------- SOS ----------
void barraSos(float p) {
  int w = (int)((TFT_ANCHO - 12) * p);
  tft.drawRect(4, Y_SOS_BARRA, TFT_ANCHO - 8, 11, COL_ROJO);
  tft.fillRect(6, Y_SOS_BARRA + 2, w, 7, COL_ROJO);
  tft.fillRect(6 + w, Y_SOS_BARRA + 2, TFT_ANCHO - 12 - w, 7, COL_FONDO);
}

void borrarBarraSos() {
  tft.fillRect(0, Y_SOS_BARRA, TFT_ANCHO, 12, COL_FONDO);
}

void pantallaSos(const char* linea) {
  tft.fillScreen(COL_ROJO);
  invalidarCampos();
  textoCentrado("SOS", 50, 8, COL_BLANCO, COL_ROJO);   // 8 = 48x64 px por caracter
  char t[27];
  snprintf(t, sizeof t, "%s", linea ? linea : "");      // 26 caracteres de tamano 2
  textoCentrado(t, 140, 2, COL_BLANCO, COL_ROJO);
  textoCentrado("ROJO: cerrar", 180, 2, COL_BLANCO, COL_ROJO);
}

// ---------- Mensaje de la base ----------
void pantallaMensajeBase(const char* de, const char* texto) {
  tft.fillScreen(COL_FONDO);
  invalidarCampos();
  tft.drawRect(2, 2, TFT_ANCHO - 4, 236, COL_AMARILLO);
  tft.drawRect(3, 3, TFT_ANCHO - 6, 234, COL_AMARILLO);
  textoCentrado("MENSAJE DE LA BASE", 14, 2, COL_AMARILLO, COL_FONDO);
  char t[40];
  snprintf(t, sizeof t, "de: %.24s", de && *de ? de : "Base");
  textoCentrado(t, 40, 1, COL_GRIS, COL_FONDO);
  // Texto en hasta 4 lineas de 25 caracteres (tamano 2), cortando en espacios
  const int ANCHO = 25;
  const char* p = texto ? texto : "";
  int y = 70;
  for (int linea = 0; linea < 4 && *p; linea++) {
    while (*p == ' ') p++;
    int n = (int)strlen(p);
    if (n > ANCHO) {
      n = ANCHO;
      while (n > 0 && p[n] != ' ') n--;
      if (n == 0) n = ANCHO;   // palabra mas larga que la linea
    }
    char l[ANCHO + 1];
    memcpy(l, p, n);
    l[n] = 0;
    textoCentrado(l, y, 2, COL_BLANCO, COL_FONDO);
    p += n;
    y += 26;
  }
  textoCentrado("Cualquier boton: cerrar", 210, 1, COL_VERDE, COL_FONDO);
}

}  // namespace ui
