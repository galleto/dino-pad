#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

// ===== PINES (tu cableado) =====
// SPI por defecto del ESP32: SCK=18, MISO=19, MOSI=23
#define TFT_CS         5
#define TFT_DC         2
#define TFT_RST        4
#define TOUCH_CS       15   // T_CS: se deja inactivo
#define SD_CS          32   // SD_CS: se deja inactivo

#define PIN_ENC_CLK    35
#define PIN_ENC_DT     33
#define PIN_ENC_SW     25
#define PIN_BTN_NEGRO  13   // pata 2 al GPIO, la otra pata a GND
#define PIN_BTN_BLANCO 14
#define PIN_BTN_ROJO   26

// ===== AJUSTES =====
#define ROTACION          1       // 1 o 3 = horizontal (el diseno es para 320x240)
#define PASOS_POR_MUESCA  4       // si cada "clic" cuenta de 2 en 2, pon 2
#define INVERTIR_GIRO     false   // true si derecha/izquierda salen al reves

// Colores RGB565
#define C_NEGRO    0x0000
#define C_BLANCO   0xFFFF
#define C_ROJO     0xF800
#define C_VERDE    0x07E0
#define C_AZUL     0x001F
#define C_CIAN     0x07FF
#define C_AMARILLO 0xFFE0
#define C_GRIS     0x7BEF

Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);

// ===== Perilla KY-040 (con interrupciones) =====
volatile int32_t encPos  = 0;
volatile int8_t  encAcc  = 0;
volatile uint8_t encPrev = 0;

void IRAM_ATTR isrEncoder() {
  static const int8_t TABLA[16] = {0,-1,1,0, 1,0,0,-1, -1,0,0,1, 0,1,-1,0};
  uint8_t ahora = (digitalRead(PIN_ENC_CLK) << 1) | digitalRead(PIN_ENC_DT);
  int8_t acc = encAcc + TABLA[(encPrev << 2) | ahora];
  encPrev = ahora;
  if (acc >= PASOS_POR_MUESCA) {
    acc = 0;
    encPos = encPos + (INVERTIR_GIRO ? -1 : 1);
  } else if (acc <= -PASOS_POR_MUESCA) {
    acc = 0;
    encPos = encPos + (INVERTIR_GIRO ? 1 : -1);
  }
  encAcc = acc;
}

// ===== Botones =====
struct Boton {
  const char* nombre;
  uint8_t pin;
  uint16_t color;
  bool presionado;
  bool lecturaPrev;
  uint32_t tCambio;
};

Boton botones[4] = {
  {"NEGRO",  PIN_BTN_NEGRO,  C_GRIS,   false, false, 0},
  {"BLANCO", PIN_BTN_BLANCO, C_BLANCO, false, false, 0},
  {"ROJO",   PIN_BTN_ROJO,   C_ROJO,   false, false, 0},
  {"SW",     PIN_ENC_SW,     C_CIAN,   false, false, 0}   // boton de la perilla
};

// ===== Dibujo =====
void textoCentrado(const char* txt, int xCol, int anchoCol, int y, uint8_t tam, uint16_t fg, uint16_t bg) {
  int w = strlen(txt) * 6 * tam;
  tft.setTextSize(tam);
  tft.setTextColor(fg, bg);
  tft.setCursor(xCol + (anchoCol - w) / 2, y);
  tft.print(txt);
}

void dibujarBoton(int i) {
  int x = i * 80 + 5;
  tft.fillRoundRect(x, 150, 70, 50, 6, botones[i].presionado ? botones[i].color : C_NEGRO);
  tft.drawRoundRect(x, 150, 70, 50, 6, botones[i].color);
}

void dibujarPerilla(int32_t pos, int dir) {
  char buf[12];
  snprintf(buf, sizeof(buf), "%5ld", (long)pos);
  textoCentrado(buf, 0, 320, 64, 5, C_AMARILLO, C_NEGRO);

  tft.fillRect(0, 118, 320, 16, C_NEGRO);
  if (dir > 0)      textoCentrado("DERECHA ->", 0, 320, 118, 2, C_VERDE, C_NEGRO);
  else if (dir < 0) textoCentrado("<- IZQUIERDA", 0, 320, 118, 2, C_VERDE, C_NEGRO);
}

void dibujarBase() {
  tft.fillScreen(C_NEGRO);
  tft.fillRect(0, 0, 320, 26, C_AZUL);
  textoCentrado("DINOPAD - TEST CONTROLES", 0, 320, 5, 2, C_BLANCO, C_AZUL);
  textoCentrado("PERILLA KY-040", 0, 320, 36, 2, C_CIAN, C_NEGRO);
  for (int i = 0; i < 4; i++) {
    dibujarBoton(i);
    textoCentrado(botones[i].nombre, i * 80, 80, 210, 2, botones[i].color, C_NEGRO);
  }
  dibujarPerilla(0, 0);
}

void pruebaColores() {
  const uint16_t colores[4] = {C_ROJO, C_VERDE, C_AZUL, C_BLANCO};
  const char* nombres[4]    = {"ROJO", "VERDE", "AZUL", "BLANCO"};
  for (int i = 0; i < 4; i++) {
    tft.fillScreen(colores[i]);
    textoCentrado(nombres[i], 0, tft.width(), tft.height() / 2 - 16, 4,
                  (i == 3) ? C_NEGRO : C_BLANCO, colores[i]);
    delay(700);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);

  // Otros dispositivos del bus SPI: inactivos (CS en HIGH)
  pinMode(TOUCH_CS, OUTPUT); digitalWrite(TOUCH_CS, HIGH);
  pinMode(SD_CS, OUTPUT);    digitalWrite(SD_CS, HIGH);

  // Entradas
  pinMode(PIN_ENC_CLK, INPUT);          // GPIO35: sin pull-up interno (usa los del KY-040)
  pinMode(PIN_ENC_DT, INPUT_PULLUP);
  for (int i = 0; i < 4; i++) pinMode(botones[i].pin, INPUT_PULLUP);   // incluye SW

  encPrev = (digitalRead(PIN_ENC_CLK) << 1) | digitalRead(PIN_ENC_DT);
  attachInterrupt(digitalPinToInterrupt(PIN_ENC_CLK), isrEncoder, CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_ENC_DT),  isrEncoder, CHANGE);

  // Pantalla
  tft.begin(20000000);      // 20 MHz: seguro con cables dupont
  tft.setRotation(ROTACION);
  pruebaColores();
  dibujarBase();
  Serial.println("Listo: gira la perilla y presiona los botones.");
}

void loop() {
  // --- Perilla ---
  static int32_t posPrev = 0;
  int32_t pos = encPos;
  if (pos != posPrev) {
    int dir = (pos > posPrev) ? 1 : -1;
    Serial.printf("Perilla %s -> posicion %ld\n", dir > 0 ? "DERECHA" : "IZQUIERDA", (long)pos);
    dibujarPerilla(pos, dir);
    posPrev = pos;
  }

  // --- Estado crudo de CLK y DT (sirve para detectar cableado o pull-up faltante) ---
  static int estPrev = -1;
  int est = (digitalRead(PIN_ENC_CLK) << 1) | digitalRead(PIN_ENC_DT);
  if (est != estPrev) {
    estPrev = est;
    char b[24];
    snprintf(b, sizeof(b), "CLK=%d  DT=%d", (est >> 1) & 1, est & 1);
    textoCentrado(b, 0, 320, 138, 1, C_GRIS, C_NEGRO);
  }

  // --- Botones (antirrebote de 30 ms) ---
  for (int i = 0; i < 4; i++) {
    bool lectura = (digitalRead(botones[i].pin) == LOW);
    if (lectura != botones[i].lecturaPrev) {
      botones[i].lecturaPrev = lectura;
      botones[i].tCambio = millis();
    }
    if (lectura != botones[i].presionado && (millis() - botones[i].tCambio) > 30) {
      botones[i].presionado = lectura;
      dibujarBoton(i);
      Serial.printf("Boton %s: %s\n", botones[i].nombre, lectura ? "PRESIONADO" : "suelto");
    }
  }
}