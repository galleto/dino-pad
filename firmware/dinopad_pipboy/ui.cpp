// ui.cpp - ver ui.h
#include "ui.h"

#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <SPI.h>
#include <pines.h>

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
  N_CAMPOS
};
static Campo campos[N_CAMPOS];

// Graficas: se redibujan si llega una muestra nueva o pasa un minuto (para correrse)
static uint32_t graficaVersion = 0;
static uint32_t graficaMinuto = 0;
static bool graficaValida = false;

static void invalidarCampos() {
  for (auto& c : campos) c.valido = false;
  graficaValida = false;
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
  } else {
    // Pestanas todavia vacias
    textoCentrado(NOMBRES_PESTANA[pestana], Y_CONTENIDO + 40, 3, COL_VERDE, COL_FONDO);
    textoCentrado("(vacia: proxima etapa)", Y_CONTENIDO + 84, 1, COL_VERDE_MED, COL_FONDO);
  }
}

void pie(const char* evento) {
  tft.fillRect(0, Y_PIE - 2, TFT_ANCHO, TFT_ALTO - Y_PIE + 2, COL_FONDO);
  tft.drawFastHLine(0, Y_PIE - 3, TFT_ANCHO, COL_VERDE_OSC);
  tft.setTextSize(1);
  tft.setTextColor(COL_AMARILLO, COL_FONDO);
  tft.setCursor(6, Y_PIE);
  tft.printf("Ultimo: %.42s", evento);
  tft.setTextColor(COL_VERDE_MED, COL_FONDO);
  tft.setCursor(6, Y_PIE + 12);
  tft.print("NEG:<  BLA:>  ROJO:ok/largo volver  NEG+BLA 3s:SOS");   // 48 car. = 288 px
}

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

void actualizar(int pestana, Modo modo, const Compartido& c, uint32_t ahora) {
  if (modo == Modo::SOS) return;

  // Indicador BLE en la barra de titulo (todas las pestanas)
  char t[20];
  snprintf(t, sizeof t, "BLE %s", c.estado == EstadoBle::CONECTADO ? "OK" :
                                  c.estado == EstadoBle::DESCONECTADO ? "--" : "..");
  campo(C_BLE_TITULO, 262, 8, 1, colorEstado(c.estado), 9, t, COL_VERDE_OSC);

  if (pestana == P_ESTADO) contenidoEstado(c, ahora);
  else if (pestana == P_AMBIENTE) contenidoAmbiente(c, ahora);
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

void pantallaSos() {
  tft.fillScreen(COL_ROJO);
  invalidarCampos();
  textoCentrado("SOS", 50, 8, COL_BLANCO, COL_ROJO);   // 8 = 48x64 px por caracter
  textoCentrado("PRUEBA: no se envia nada", 140, 2, COL_BLANCO, COL_ROJO);
  textoCentrado("ROJO: cerrar", 180, 2, COL_BLANCO, COL_ROJO);
}

}  // namespace ui
