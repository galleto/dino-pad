// pantalla.cpp - ver pantalla.h
#include "pantalla.h"

#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <SPI.h>

#include "src/mtpb/config.pb.h"
#include "src/mtpb/mesh.pb.h"

// ===== PINES (como firmware/dinopad) =====
#define TFT_CS   5
#define TFT_DC   2
#define TFT_RST  4
#define SPI_FREQ 10000000   // 10 MHz
// Orientacion, elegida con firmware/test_geometria y firmware/test_madctl:
// este panel es 320x240 "nativo". Se usa setRotation(1) para que la libreria
// trabaje en 320x240 y JUSTO DESPUES se escribe MADCTL (0x36) = 0x48 para que la
// imagen salga horizontal, sin espejo y con (0,0) arriba a la izquierda.
#define ROTACION 1
#define MADCTL   0x48

// ===== COLORES RGB565 (misma paleta que firmware/dinopad) =====
#define COL_FONDO     0x0000
#define COL_VERDE     0x07E0
#define COL_VERDE_OSC 0x0240
#define COL_CIAN      0x07FF
#define COL_AMARILLO  0xFFE0
#define COL_ROJO      0xF800
#define COL_BLANCO    0xFFFF
#define COL_GRIS      0x8410

// ===== DISENO (320 x 240, dos columnas) =====
// Fuente por defecto: 6x8 px por caracter * tamano.
//   y 0-22     barra de titulo (tamano 2)
//   y 28-52    estado grande (tamano 3, max 12 caracteres = 216 px)
//   y 56-64    subtitulo (tracker / RSSI)
//   y 72-171   izquierda (x 4-153): 8 pasos, 13 px por fila
//              derecha (x 160-316): titulo + 9 filas de datos, 11 px por fila
//   y 186-237  recuadro de resultado (ancho completo)
#define ANCHO        320
#define ALTO         240
#define Y_ESTADO     28
#define Y_SUBTITULO  56
#define Y_PASOS      72
#define ALTO_PASO    13
#define X_DATOS      160  // columna derecha: etiquetas
#define X_VALOR      190  // columna derecha: valores (21 caracteres hasta x=316)
#define Y_DATOS_TIT  72
#define Y_DATOS      85
#define ALTO_DATO    11
#define Y_RESULTADO  186
#define ALTO_RESULT  52
#define CHARS_LINEA  51   // caracteres de tamano 1 que caben entre x=6 y x=312

static Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);

static const char* NOMBRES_PASO[9] = {
  "", "Buscar tracker", "Conectar BLE", "Emparejar PIN", "MTU",
  "Servicio Mesh", "Config inicial", "Enviar texto", "Respuesta nodo",
};

namespace pantalla {

static uint32_t ultimoDibujoDatos = 0;

// ---- Estado guardado para poder redibujar todo (redibujarTodo) ----
enum class Resultado { NINGUNO, ENVIADO, ERROR, AVISO };
static char macGuardada[24] = "";
static bool hayEstado = false;
static EstadoConexion estadoGuardado = EstadoConexion::BUSCANDO;
static bool hayNombre = false;
static char nombreGuardado[32] = "";
static int rssiGuardado = 0;
static EstadoPaso pasosGuardados[9] = {};
static Resultado resultado = Resultado::NINGUNO;
static char resultadoTexto[160] = "";
static bool resultadoConfirmado = false;
static int resultadoPaso = 0;
static bool hayAck = false;
static char ackTexto[64] = "";
static bool ackOk = false;
static const DatosTracker* datosGuardados = nullptr;
static bool forzarDatos = false;

static void dibujarEstado();
static void dibujarNombre();
static void dibujarPaso(int n);
static void dibujarResultado();
static void dibujarAck();
static void limpiarResultado(uint16_t borde);

static void textoEn(int x, int y, uint8_t tam, uint16_t color, const char* s) {
  tft.setTextSize(tam);
  tft.setTextColor(color, COL_FONDO);
  tft.setCursor(x, y);
  tft.print(s);
}

// Fondo fijo: barra, subtitulo inicial, separadores, titulos y marco del resultado
static void dibujarBase() {
  tft.fillRect(0, 0, ANCHO, 22, COL_VERDE_OSC);
  tft.drawFastHLine(0, 22, ANCHO, COL_VERDE);
  tft.setTextSize(2);
  tft.setTextColor(COL_VERDE, COL_VERDE_OSC);
  tft.setCursor(6, 4);
  tft.print("DINOPAD // T1000-E");

  tft.drawFastHLine(0, Y_PASOS - 6, ANCHO, COL_GRIS);
  tft.drawFastVLine(X_DATOS - 6, Y_PASOS - 6, Y_RESULTADO - Y_PASOS + 6, COL_GRIS);
  textoEn(X_DATOS, Y_DATOS_TIT, 1, COL_GRIS, "DATOS DEL TRACKER");
  tft.drawRect(0, Y_RESULTADO, ANCHO, ALTO_RESULT, COL_GRIS);
}

void iniciar(const char* mac) {
  strncpy(macGuardada, mac, sizeof macGuardada - 1);
  for (int n = 1; n <= 8; n++) pasosGuardados[n] = EstadoPaso::PENDIENTE;
  tft.begin(SPI_FREQ);
  tft.fillScreen(COL_FONDO);   // negro en toda la memoria del panel antes de rotar
  tft.setRotation(ROTACION);           // la libreria queda en 320x240
  uint8_t madctl = MADCTL;
  tft.sendCommand(0x36, &madctl, 1);   // orientacion real del panel (ver arriba)
  // width()/height() son los de la libreria (fijados por setRotation, no medidos)
  Serial.printf("Pantalla: SPI %lu Hz, setRotation(%d) + MADCTL 0x%02X -> width()=%d height()=%d (diseno %dx%d)%s\n",
                (unsigned long)SPI_FREQ, ROTACION, MADCTL, tft.width(), tft.height(), ANCHO, ALTO,
                (tft.width() == ANCHO && tft.height() == ALTO) ? "" : "  AVISO: NO COINCIDE");
  redibujarTodo();
}

void redibujarTodo() {
  tft.fillScreen(COL_FONDO);
  dibujarBase();
  if (hayEstado) dibujarEstado();
  dibujarNombre();
  for (int n = 1; n <= 8; n++) dibujarPaso(n);
  dibujarResultado();
  if (hayAck) dibujarAck();
  if (datosGuardados) { forzarDatos = true; datos(*datosGuardados, millis()); }
}

void estado(EstadoConexion e) {
  estadoGuardado = e;
  hayEstado = true;
  dibujarEstado();
}

static void dibujarEstado() {
  EstadoConexion e = estadoGuardado;
  const char* txt = "";
  uint16_t color = COL_BLANCO;
  switch (e) {
    case EstadoConexion::BUSCANDO:     txt = "BUSCANDO";     color = COL_AMARILLO; break;
    case EstadoConexion::CONECTANDO:   txt = "CONECTANDO";   color = COL_AMARILLO; break;
    case EstadoConexion::EMPAREJADO:   txt = "EMPAREJADO";   color = COL_VERDE;    break;
    case EstadoConexion::CONECTADO:    txt = "CONECTADO";    color = COL_VERDE;    break;
    case EstadoConexion::DESCONECTADO: txt = "DESCONECTADO"; color = COL_ROJO;     break;
    case EstadoConexion::FALLO:        txt = "FALLO";        color = COL_ROJO;     break;
  }
  tft.fillRect(0, Y_ESTADO - 2, ANCHO, 26, COL_FONDO);
  textoEn(6, Y_ESTADO, 3, color, txt);
}

void nombreTracker(const char* nombre, int rssi) {
  strncpy(nombreGuardado, nombre, sizeof nombreGuardado - 1);
  rssiGuardado = rssi;
  hayNombre = true;
  dibujarNombre();
}

static void dibujarNombre() {
  char sub[64];
  if (hayNombre) snprintf(sub, sizeof sub, "tracker %.24s %d dBm", nombreGuardado, rssiGuardado);   // max 38
  else snprintf(sub, sizeof sub, "objetivo %s", macGuardada);
  tft.fillRect(0, Y_SUBTITULO - 1, ANCHO, 10, COL_FONDO);
  textoEn(6, Y_SUBTITULO, 1, COL_CIAN, sub);
}

// Iconos de 9x9 px dibujados con lineas (la fuente por defecto no trae check)
static void icono(int x, int y, EstadoPaso e) {
  tft.fillRect(x, y, 10, 10, COL_FONDO);
  switch (e) {
    case EstadoPaso::OK:   // check
      tft.drawLine(x, y + 5, x + 3, y + 8, COL_VERDE);
      tft.drawLine(x + 1, y + 5, x + 4, y + 8, COL_VERDE);
      tft.drawLine(x + 3, y + 8, x + 9, y + 1, COL_VERDE);
      tft.drawLine(x + 4, y + 8, x + 9, y + 2, COL_VERDE);
      break;
    case EstadoPaso::ERROR:   // X
      tft.drawLine(x + 1, y + 1, x + 8, y + 8, COL_ROJO);
      tft.drawLine(x + 2, y + 1, x + 9, y + 8, COL_ROJO);
      tft.drawLine(x + 8, y + 1, x + 1, y + 8, COL_ROJO);
      tft.drawLine(x + 9, y + 1, x + 2, y + 8, COL_ROJO);
      break;
    case EstadoPaso::EN_CURSO:   // flecha
      tft.fillTriangle(x + 2, y + 1, x + 2, y + 8, x + 8, y + 4, COL_AMARILLO);
      break;
    case EstadoPaso::OMITIDO:
      tft.drawFastHLine(x + 2, y + 5, 6, COL_GRIS);
      break;
    case EstadoPaso::PENDIENTE:
      tft.drawRect(x + 2, y + 2, 6, 6, COL_GRIS);
      break;
  }
}

void paso(int n, EstadoPaso e) {
  if (n < 1 || n > 8) return;
  pasosGuardados[n] = e;
  dibujarPaso(n);
}

static void dibujarPaso(int n) {
  EstadoPaso e = pasosGuardados[n];
  int y = Y_PASOS + (n - 1) * ALTO_PASO;
  icono(4, y - 1, e);
  uint16_t color = COL_GRIS;
  if (e == EstadoPaso::OK) color = COL_BLANCO;
  else if (e == EstadoPaso::EN_CURSO) color = COL_AMARILLO;
  else if (e == EstadoPaso::ERROR) color = COL_ROJO;
  char linea[32];
  snprintf(linea, sizeof linea, "[%d/8] %-15s", n, NOMBRES_PASO[n]);
  textoEn(18, y, 1, color, linea);
}

static void limpiarResultado(uint16_t borde) {
  tft.fillRect(1, Y_RESULTADO + 1, ANCHO - 2, ALTO_RESULT - 2, COL_FONDO);
  tft.drawRect(0, Y_RESULTADO, ANCHO, ALTO_RESULT, borde);
}

// Imprime 'texto' partido en lineas de 'ancho' caracteres
static void parrafo(int x, int y, int ancho, int maxLineas, uint16_t color, const char* texto) {
  char linea[64];
  int len = strlen(texto);
  for (int l = 0, i = 0; l < maxLineas && i < len; l++) {
    int n = min(ancho, len - i);
    if (i + n < len) {   // cortar en espacio si se puede
      int c = n;
      while (c > 0 && texto[i + c] != ' ') c--;
      if (c > 0) n = c;
    }
    memcpy(linea, texto + i, n);
    linea[n] = 0;
    textoEn(x, y + l * 10, 1, color, linea);
    i += n;
    while (i < len && texto[i] == ' ') i++;
  }
}

void enviado(const char* texto, bool confirmadoEnCola) {
  resultado = Resultado::ENVIADO;
  strncpy(resultadoTexto, texto, sizeof resultadoTexto - 1);
  resultadoConfirmado = confirmadoEnCola;
  dibujarResultado();
  if (hayAck) dibujarAck();
}

static void dibujarEnviado(const char* texto, bool confirmadoEnCola) {
  limpiarResultado(COL_VERDE);
  // Fila 1: "ENVIADO:" (tamano 2, 96 px) + estado (tamano 1)
  // Fila 2: el texto en tamano 2 (max 25 caracteres = 300 px)
  // Fila 3: ACK/NAK (ackEnvio)
  textoEn(6, Y_RESULTADO + 4, 2, COL_VERDE, "ENVIADO:");
  textoEn(110, Y_RESULTADO + 8, 1, confirmadoEnCola ? COL_VERDE : COL_AMARILLO,
          confirmadoEnCola ? "en cola (res=0)" : "escrito en ToRadio");
  char t[32];
  snprintf(t, sizeof t, "%.25s", texto);
  textoEn(6, Y_RESULTADO + 22, 2, COL_BLANCO, t);
}

void ackEnvio(const char* texto, bool ok) {
  strncpy(ackTexto, texto, sizeof ackTexto - 1);
  ackOk = ok;
  hayAck = true;
  dibujarAck();
}

static void dibujarAck() {
  const char* texto = ackTexto;
  bool ok = ackOk;
  char t[CHARS_LINEA + 1];
  snprintf(t, sizeof t, "%.*s", CHARS_LINEA, texto);   // se corta a una linea a proposito
  tft.fillRect(2, Y_RESULTADO + 41, ANCHO - 4, 9, COL_FONDO);
  textoEn(6, Y_RESULTADO + 42, 1, ok ? COL_VERDE : COL_ROJO, t);
}

void error(int paso, const char* motivo) {
  resultado = Resultado::ERROR;
  resultadoPaso = paso;
  strncpy(resultadoTexto, motivo, sizeof resultadoTexto - 1);
  hayAck = false;
  dibujarResultado();
}

static void dibujarError(int paso, const char* motivo) {
  limpiarResultado(COL_ROJO);
  char t[32];
  if (paso >= 1 && paso <= 8) snprintf(t, sizeof t, "ERROR en [%d/8]", paso);
  else snprintf(t, sizeof t, "ERROR");
  textoEn(6, Y_RESULTADO + 4, 2, COL_ROJO, t);
  parrafo(6, Y_RESULTADO + 22, CHARS_LINEA, 3, COL_BLANCO, motivo);
}

void aviso(const char* texto) {
  resultado = Resultado::AVISO;
  strncpy(resultadoTexto, texto, sizeof resultadoTexto - 1);
  hayAck = false;
  dibujarResultado();
}

static void dibujarAviso(const char* texto) {
  limpiarResultado(COL_GRIS);
  parrafo(6, Y_RESULTADO + 5, CHARS_LINEA, 4, COL_BLANCO, texto);
}

static void dibujarResultado() {
  switch (resultado) {
    case Resultado::ENVIADO: dibujarEnviado(resultadoTexto, resultadoConfirmado); break;
    case Resultado::ERROR:   dibujarError(resultadoPaso, resultadoTexto); break;
    case Resultado::AVISO:   dibujarAviso(resultadoTexto); break;
    case Resultado::NINGUNO: limpiarResultado(COL_GRIS); break;
  }
}

// ---------- Panel de datos ----------
static void dato(int fila, const char* etiqueta, const char* valor, uint16_t color) {
  int y = Y_DATOS + fila * ALTO_DATO;
  tft.setTextSize(1);
  tft.setCursor(X_DATOS, y);
  tft.setTextColor(COL_GRIS, COL_FONDO);
  tft.print(etiqueta);
  tft.setTextColor(color, COL_FONDO);
  tft.setCursor(X_VALOR, y);
  char v[40];
  snprintf(v, sizeof v, "%-21.21s", valor);   // 21 caracteres: de x=190 a x=316
  tft.print(v);
}

static void edad(char* buf, size_t n, uint32_t msDato, uint32_t ahora) {
  if (!msDato) { buf[0] = 0; return; }
  uint32_t s = (ahora - msDato) / 1000;
  if (s < 120) snprintf(buf, n, " %lus", (unsigned long)s);
  else snprintf(buf, n, " %lum", (unsigned long)(s / 60));
}

void datos(const DatosTracker& d, uint32_t ahora) {
  datosGuardados = &d;   // 'd' es global en el .ino: el puntero sigue valido
  if (!forzarDatos && !d.cambio && ahora - ultimoDibujoDatos < 1000) return;
  forzarDatos = false;
  ultimoDibujoDatos = ahora;
  char v[64], e[12];

  // 0: nombre
  if (d.tieneUsuario) snprintf(v, sizeof v, "%s (%s)", d.nombreLargo, d.nombreCorto);
  else if (d.tieneMiNodo) snprintf(v, sizeof v, "!%08lx", (unsigned long)d.miNodo);
  else snprintf(v, sizeof v, "-");
  dato(0, "Nodo", v, COL_CIAN);

  // 1: firmware y nodos en la base
  if (d.tieneFirmware) snprintf(v, sizeof v, "%s  %un", d.firmware, (unsigned)d.nodosEnDb);
  else snprintf(v, sizeof v, "-");
  dato(1, "FW", v, COL_BLANCO);

  // 2: bateria
  edad(e, sizeof e, d.msMetricas, ahora);
  if (d.tieneBateria && d.bateria > 100) snprintf(v, sizeof v, "USB");
  else if (d.tieneBateria) snprintf(v, sizeof v, "%lu%%", (unsigned long)d.bateria);
  else snprintf(v, sizeof v, "sin dato");
  if (d.tieneVoltaje) { size_t l = strlen(v); snprintf(v + l, sizeof v - l, " %.2fV", d.voltaje); }
  { size_t l = strlen(v); snprintf(v + l, sizeof v - l, "%s", e); }
  dato(2, "Bat", v, d.tieneBateria ? (d.bateria <= 20 ? COL_ROJO : COL_VERDE) : COL_GRIS);

  // 3: uso del canal
  if (d.tieneUsoCanal) snprintf(v, sizeof v, "%.1f%% tx %.1f%%", d.usoCanal, d.tieneAirTx ? d.airTx : 0.0f);
  else snprintf(v, sizeof v, "sin dato");
  dato(3, "Canal", v, d.tieneUsoCanal ? COL_BLANCO : COL_GRIS);

  // 4: uptime
  if (d.tieneUptime) snprintf(v, sizeof v, "%luh %02lum", (unsigned long)(d.uptime / 3600),
                              (unsigned long)((d.uptime / 60) % 60));
  else snprintf(v, sizeof v, "sin dato");
  dato(4, "Up", v, d.tieneUptime ? COL_BLANCO : COL_GRIS);

  // 5-6: posicion
  if (d.tienePosicion) {
    edad(e, sizeof e, d.msPosicion, ahora);
    snprintf(v, sizeof v, "%.5f", d.latitudI * 1e-7);
    dato(5, "Lat", v, COL_BLANCO);
    snprintf(v, sizeof v, "%.5f s%lu%s", d.longitudI * 1e-7, (unsigned long)d.satelites, e);
    dato(6, "Lon", v, COL_BLANCO);
  } else {
    const char* motivo = "sin fix";
    if (d.tieneCfgPosicion && d.gpsMode != meshtastic_Config_PositionConfig_GpsMode_ENABLED)
      motivo = meshtastic_Config_PositionConfig_GpsMode_name(
          (meshtastic_Config_PositionConfig_GpsMode)d.gpsMode);
    dato(5, "Lat", motivo, COL_GRIS);
    dato(6, "Lon", "", COL_GRIS);
  }

  // 7-8: ambiente (NTC y luz del T1000-E)
  bool desactivado = d.tieneCfgTelemetria && !d.ambienteActivado;
  if (d.tieneTemperatura) {
    edad(e, sizeof e, d.msAmbiente, ahora);
    snprintf(v, sizeof v, "%.1f C%s", d.temperatura, e);
    dato(7, "Temp", v, COL_BLANCO);
  } else {
    dato(7, "Temp", desactivado ? "desactivada" : "esperando", COL_GRIS);
  }
  if (d.tieneLuz) {
    snprintf(v, sizeof v, "%.0f /100", d.luz);
    dato(8, "Luz", v, COL_BLANCO);
  } else {
    dato(8, "Luz", desactivado ? "desactivada" : "esperando", COL_GRIS);
  }
}

}  // namespace pantalla
