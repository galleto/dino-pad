// test_rotacion: muestra la ILI9341 en las 4 rotaciones de Adafruit_GFX (0-3),
// 8 segundos cada una, en bucle. En cada una dibuja:
//   - un marco en el borde de toda el area (debe verse completo)
//   - un cuadro ROJO en la esquina superior izquierda logica ("SUP-IZQ")
//   - "ROT n" en grande, el tamano logico (ancho x alto) y una flecha ARRIBA
// La rotacion correcta es la que se ve HORIZONTAL (ancho 320), con el texto
// legible, el marco completo y el cuadro rojo arriba a la izquierda.
// Pines como firmware/dinopad: CS=5, DC=2, RST=4.

#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <SPI.h>

#define TFT_CS   5
#define TFT_DC   2
#define TFT_RST  4
#define SPI_FREQ 27000000
#define MS_POR_ROTACION 8000

Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);

void mostrarRotacion(uint8_t r) {
  tft.setRotation(r);
  tft.fillScreen(ILI9341_BLACK);
  int w = tft.width(), h = tft.height();

  tft.drawRect(0, 0, w, h, ILI9341_WHITE);
  tft.drawRect(2, 2, w - 4, h - 4, ILI9341_WHITE);

  tft.fillRect(6, 6, 34, 34, ILI9341_RED);
  tft.setTextSize(1);
  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setCursor(44, 8);
  tft.print("SUP-IZQ");

  // Flecha hacia arriba en el centro superior
  tft.fillTriangle(w / 2, 8, w / 2 - 12, 28, w / 2 + 12, 28, ILI9341_YELLOW);
  tft.setTextColor(ILI9341_YELLOW, ILI9341_BLACK);
  tft.setCursor(w / 2 - 18, 32);
  tft.print("ARRIBA");

  char t[16];
  snprintf(t, sizeof t, "ROT %u", r);
  tft.setTextSize(5);   // 30x40 px por caracter
  tft.setTextColor(ILI9341_GREEN, ILI9341_BLACK);
  tft.setCursor((w - 5 * 30) / 2, h / 2 - 20);
  tft.print(t);

  snprintf(t, sizeof t, "%d x %d", w, h);
  tft.setTextSize(2);
  tft.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
  tft.setCursor((w - (int)strlen(t) * 12) / 2, h / 2 + 30);
  tft.print(t);

  tft.setTextSize(1);
  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setCursor(8, h - 14);
  tft.print(w > h ? "horizontal" : "vertical");

  Serial.printf("ROTACION %u -> %d x %d (%s)\n", r, w, h, w > h ? "horizontal" : "vertical");
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n== test_rotacion: 0,1,2,3 cada 8 s, en bucle ==");
  tft.begin(SPI_FREQ);
  tft.fillScreen(ILI9341_BLACK);
}

void loop() {
  for (uint8_t r = 0; r < 4; r++) {
    mostrarRotacion(r);
    delay(MS_POR_ROTACION);
  }
}
