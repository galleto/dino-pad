// test_botones: encuentra a que GPIO esta soldado cada boton.
// Pone INPUT_PULLUP en los GPIO seguros de un ESP32 clasico y avisa por serial
// (115200) y en pantalla "GPIO n" cada vez que uno pasa a LOW (boton presionado
// contra GND). Tambien avisa cuando se suelta.
//
// Excluidos:
//   0, 1, 3        arranque / UART0 (serial)
//   6-11           flash SPI interna
//   12             strapping (voltaje de la flash)
//   34-39          solo entrada, sin pull-up interno
//   2, 4, 5        pantalla (DC, RST, CS)
//   18, 19, 23     SPI de la pantalla (SCK, MISO, MOSI)
// Nota: 16 y 17 se usan para PSRAM en modulos WROVER; con la placa
// esp32:esp32:esp32 (PSRAM desactivada) se pueden probar sin problema.

#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <SPI.h>
#include <pines.h>   // firmware/libraries/dinopad_pines

// Resultado en esta placa: NEGRO=13, BLANCO=26, ROJO=14 (ahora en pines.h).
static const uint8_t CANDIDATOS[] = {13, 14, 15, 16, 17, 21, 22, 25, 26, 27, 32, 33};
static const int N = sizeof(CANDIDATOS) / sizeof(CANDIDATOS[0]);
static const uint32_t ANTIRREBOTE_MS = 30;

Adafruit_ILI9341 tft(PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST);

static bool estable[N];          // true = HIGH (suelto)
static bool ultimaLectura[N];
static uint32_t cambioMs[N];
static int historial[6];         // ultimos GPIO presionados (para la pantalla)
static int nHistorial = 0;

static void dibujarBase() {
  tft.fillScreen(ILI9341_BLACK);
  tft.fillRect(0, 0, 320, 22, 0x0240);
  tft.setTextSize(2);
  tft.setTextColor(ILI9341_GREEN, 0x0240);
  tft.setCursor(6, 4);
  tft.print("TEST BOTONES");
  tft.setTextSize(1);
  tft.setTextColor(0x8410, ILI9341_BLACK);
  tft.setCursor(6, 30);
  tft.print("Probando GPIO:");
  tft.setCursor(6, 42);
  for (int i = 0; i < N; i++) tft.printf("%d ", CANDIDATOS[i]);
  tft.setCursor(6, 200);
  tft.print("Presiona NEGRO, BLANCO y ROJO uno por uno");
}

static void dibujarUltimo(int gpio, bool presionado) {
  tft.fillRect(0, 60, 320, 70, ILI9341_BLACK);
  tft.setTextSize(6);   // 36x48 px por caracter
  tft.setTextColor(presionado ? ILI9341_YELLOW : 0x8410, ILI9341_BLACK);
  char t[12];
  snprintf(t, sizeof t, "GPIO %d", gpio);
  tft.setCursor((320 - (int)strlen(t) * 36) / 2, 70);
  tft.print(t);

  tft.fillRect(0, 140, 320, 50, ILI9341_BLACK);
  tft.setTextSize(2);
  tft.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
  tft.setCursor(6, 145);
  tft.print("Ultimos:");
  tft.setCursor(6, 167);
  for (int i = 0; i < nHistorial; i++) tft.printf("%d ", historial[i]);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n== test_botones: INPUT_PULLUP, aviso al pasar a LOW ==");

  tft.begin(TFT_SPI_FREQ);
  tft.fillScreen(ILI9341_BLACK);
  tft.setRotation(TFT_ROTACION);
  uint8_t m = TFT_MADCTL;
  tft.sendCommand(0x36, &m, 1);
  dibujarBase();

  Serial.print("Probando GPIO:");
  for (int i = 0; i < N; i++) {
    pinMode(CANDIDATOS[i], INPUT_PULLUP);
    Serial.printf(" %d", CANDIDATOS[i]);
  }
  Serial.println();
  delay(50);   // que se estabilicen los pull-up

  // Pines que ya estan en LOW al arrancar: boton presionado o pin a GND
  bool algunoBajo = false;
  for (int i = 0; i < N; i++) {
    bool v = digitalRead(CANDIDATOS[i]);
    estable[i] = ultimaLectura[i] = v;
    cambioMs[i] = millis();
    if (!v) {
      Serial.printf("AVISO: GPIO %d ya esta en LOW al arrancar (presionado o conectado a GND)\n",
                    CANDIDATOS[i]);
      algunoBajo = true;
    }
  }
  if (!algunoBajo) Serial.println("Todos los GPIO en HIGH. Listo: presiona los botones.");
}

void loop() {
  uint32_t ahora = millis();
  for (int i = 0; i < N; i++) {
    bool v = digitalRead(CANDIDATOS[i]);
    if (v != ultimaLectura[i]) {
      ultimaLectura[i] = v;
      cambioMs[i] = ahora;
    }
    if (v != estable[i] && ahora - cambioMs[i] >= ANTIRREBOTE_MS) {
      estable[i] = v;
      int gpio = CANDIDATOS[i];
      if (!v) {
        Serial.printf("GPIO %d -> LOW (presionado)\n", gpio);
        if (nHistorial == 6) {
          memmove(historial, historial + 1, 5 * sizeof(int));
          nHistorial = 5;
        }
        historial[nHistorial++] = gpio;
        dibujarUltimo(gpio, true);
      } else {
        Serial.printf("GPIO %d -> HIGH (suelto)\n", gpio);
        dibujarUltimo(gpio, false);
      }
    }
  }
  delay(2);
}
