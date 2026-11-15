// test_madctl: con setRotation(1) (la libreria usa 320x240) prueba varios valores
// del registro MADCTL (0x36) del controlador, 8 s cada uno, en bucle.
// En cada uno dibuja: marco completo, cuadro ROJO "SUP-IZQ" arriba a la izquierda,
// flecha "ARRIBA" y el valor probado en grande. Por serial imprime el valor.
// El correcto es el que se ve horizontal, sin espejo (texto legible) y con el
// cuadro rojo arriba a la izquierda.
// Pines como firmware/dinopad: CS=5, DC=2, RST=4. SPI a 10 MHz.

#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <SPI.h>

#define TFT_CS   5
#define TFT_DC   2
#define TFT_RST  4
#define SPI_FREQ 10000000
#define MS_POR_VALOR 8000

static const uint8_t VALORES[] = {0x28, 0x68, 0xA8, 0xE8, 0x48, 0x88};
static const int N_VALORES = sizeof(VALORES) / sizeof(VALORES[0]);

Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);

void probar(int i) {
  uint8_t v = VALORES[i];
  tft.setRotation(1);                 // la libreria queda en 320 x 240
  tft.sendCommand(0x36, &v, 1);       // MADCTL despues de setRotation
  int w = tft.width(), h = tft.height();

  tft.fillScreen(ILI9341_BLACK);
  tft.drawRect(0, 0, w, h, ILI9341_WHITE);
  tft.drawRect(2, 2, w - 4, h - 4, ILI9341_WHITE);

  tft.fillRect(6, 6, 34, 34, ILI9341_RED);
  tft.setTextSize(1);
  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setCursor(44, 8);
  tft.print("SUP-IZQ");

  tft.fillTriangle(w / 2, 8, w / 2 - 12, 28, w / 2 + 12, 28, ILI9341_YELLOW);
  tft.setTextColor(ILI9341_YELLOW, ILI9341_BLACK);
  tft.setCursor(w / 2 - 18, 32);
  tft.print("ARRIBA");

  char t[16];
  snprintf(t, sizeof t, "0x%02X", v);
  tft.setTextSize(5);
  tft.setTextColor(ILI9341_GREEN, ILI9341_BLACK);
  tft.setCursor((w - (int)strlen(t) * 30) / 2, h / 2 - 20);
  tft.print(t);

  snprintf(t, sizeof t, "%d/%d", i + 1, N_VALORES);
  tft.setTextSize(2);
  tft.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
  tft.setCursor((w - (int)strlen(t) * 12) / 2, h / 2 + 30);
  tft.print(t);

  tft.setTextSize(1);
  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setCursor(8, h - 14);
  tft.print("ABAJO-IZQ");

  Serial.printf("MADCTL 0x%02X (%d/%d)  libreria %dx%d\n", v, i + 1, N_VALORES, w, h);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n== test_madctl: setRotation(1) + MADCTL 0x28,0x68,0xA8,0xE8,0x48,0x88 cada 8 s ==");
  tft.begin(SPI_FREQ);
  tft.fillScreen(ILI9341_BLACK);
}

void loop() {
  for (int i = 0; i < N_VALORES; i++) {
    probar(i);
    delay(MS_POR_VALOR);
  }
}
