// test_geometria: mide el tamano FISICO de la pantalla en ROTACION 0.
//
// La libreria cree que en rotacion 0 el area es 240x320 y recorta todo lo que
// quede fuera. Aqui se quita ese recorte (area logica 320x320) y se dibujan
// marcas cada 40 px en X y en Y, cada una con su numero. Lo que se vea (y donde)
// indica el tamano real:
//   - Filas: etiquetas "y=0".."y=280" en el borde izquierdo. Las de y>=240 se
//     dibujan en otra columna (x=130) y en MAGENTA: si aparecen ARRIBA, junto a
//     "y=0".."y=40", el panel solo tiene 240 filas y da la vuelta.
//   - Columnas: lineas verticales con "x=0".."x=280". Las de x>=240 van en
//     MAGENTA: si se ven a la derecha, el panel tiene mas de 240 columnas.
// Ademas lee el ID del controlador (si el pin MISO=19 esta conectado).
// Pines como firmware/dinopad: CS=5, DC=2, RST=4. SPI a 10 MHz.

#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <SPI.h>

#define TFT_CS   5
#define TFT_DC   2
#define TFT_RST  4
#define SPI_FREQ 10000000
#define ROTACION 0

// Subclase solo para poder cambiar el area logica (son miembros protegidos)
class TftSinRecorte : public Adafruit_ILI9341 {
 public:
  using Adafruit_ILI9341::Adafruit_ILI9341;
  void fijarArea(int16_t w, int16_t h) { _width = w; _height = h; }
};

TftSinRecorte tft(TFT_CS, TFT_DC, TFT_RST);

static const uint16_t COL_NORMAL = ILI9341_GREEN;
static const uint16_t COL_FUERA  = ILI9341_MAGENTA;   // coordenadas >= 240

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n== test_geometria ==");

  tft.begin(SPI_FREQ);

  // Diagnostico del controlador (requiere MISO). ILI9341: RDID4 (0xD3) = 00 93 41
  Serial.printf("RDDID(0x04): %02x %02x %02x\n", tft.readcommand8(0x04, 1),
                tft.readcommand8(0x04, 2), tft.readcommand8(0x04, 3));
  Serial.printf("RDID4(0xD3): %02x %02x %02x\n", tft.readcommand8(0xD3, 1),
                tft.readcommand8(0xD3, 2), tft.readcommand8(0xD3, 3));
  Serial.printf("RDMADCTL: %02x  RDPIXFMT: %02x  RDSELFDIAG: %02x\n",
                tft.readcommand8(ILI9341_RDMADCTL), tft.readcommand8(ILI9341_RDPIXFMT),
                tft.readcommand8(ILI9341_RDSELFDIAG));

  tft.setRotation(ROTACION);
  Serial.printf("Libreria tras setRotation(%d): width()=%d height()=%d\n",
                ROTACION, tft.width(), tft.height());

  tft.fillScreen(ILI9341_BLACK);   // negro en el area que la libreria conoce
  tft.fijarArea(320, 320);         // quitar recorte para las pruebas
  tft.fillRect(240, 0, 80, 320, ILI9341_BLACK);   // intentar limpiar tambien x>=240
  tft.fillRect(0, 240, 320, 80, ILI9341_BLACK);   // e y>=240

  tft.setTextSize(1);

  // Columnas: linea vertical + etiqueta cada 40 px
  for (int x = 0; x < 320; x += 40) {
    uint16_t c = x >= 240 ? COL_FUERA : COL_NORMAL;
    tft.drawFastVLine(x, 0, 320, c);
    tft.setTextColor(c, ILI9341_BLACK);
    tft.setCursor(x + 2, 60);
    tft.printf("x=%d", x);
  }
  // Borde derecho logico de la libreria (x=239) en amarillo
  tft.drawFastVLine(239, 0, 320, ILI9341_YELLOW);

  // Filas: linea horizontal + etiqueta cada 40 px
  for (int y = 0; y < 320; y += 40) {
    uint16_t c = y >= 240 ? COL_FUERA : COL_NORMAL;
    tft.drawFastHLine(0, y, 320, c);
    tft.setTextColor(c, ILI9341_BLACK);
    tft.setTextSize(2);
    tft.setCursor(y >= 240 ? 130 : 4, y + 4);
    tft.printf("y=%d", y);
    tft.setTextSize(1);
  }
  // Borde inferior logico de la libreria (y=319) y y=239 en amarillo
  tft.drawFastHLine(0, 239, 320, ILI9341_YELLOW);

  Serial.println("Dibujo listo. Mira la pantalla y anota que etiquetas ves y donde.");
}

void loop() {
  delay(1000);
}
