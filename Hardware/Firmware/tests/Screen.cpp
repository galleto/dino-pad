#include <SPI.h>
#include <Adafruit_GFX.h>

// ===== DRIVER DE LA PANTALLA =====
// 0 = ILI9341 (lo normal en la placa roja de 2.8")   1 = ST7789
#define DRIVER 1

#if DRIVER == 0
  #include <Adafruit_ILI9341.h>
#else
  #include <Adafruit_ST7789.h>
#endif

// ===== PINES (tu cableado) =====
// SPI por defecto del ESP32: SCK=18, MISO=19, MOSI=23  (LED/BLK de la TFT a 3V3)
#define TFT_CS      5
#define TFT_DC      2
#define TFT_RST     4
#define TOUCH_CS    15   // T_CS: inactivo
#define SD_CS       32   // SD_CS: inactivo
#define BTN_NEGRO   13
#define BTN_BLANCO  14
#define BTN_ROJO    26
#define BTN_SW      25   // boton de la perilla KY-040

// ===== AJUSTES =====
#define PALETA     1          // 0 = claro (como Chrome), 1 = noche, 2 = verde tipo Pip-Boy
#define ROTACION   1          // 1 o 3 (horizontal)
#define SPI_FREQ   27000000   // si ves ruido baja a 20000000; para mas FPS sube a 40000000

#if PALETA == 0
  const uint16_t COL_FONDO = 0xFFFF, COL_OBJ = 0x528A, COL_TENUE = 0xAD55;
#elif PALETA == 1
  const uint16_t COL_FONDO = 0x0000, COL_OBJ = 0xFFFF, COL_TENUE = 0x4208;
#else
  const uint16_t COL_FONDO = 0x0000, COL_OBJ = 0x07E0, COL_TENUE = 0x0200;
#endif

#if DRIVER == 0
  Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);
#else
  Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_RST);
#endif

// ===== Canvas (buffer en memoria donde se dibuja el juego) =====
#define CW        320    // ancho
#define CH        110    // alto
#define Y_CANVAS  70     // y en la pantalla donde se pega
#define SUELO_Y   96     // linea del suelo dentro del canvas
#define ESC       2      // escala de los sprites
#define DINO_X    28
#define V_SALTO   8.0f
#define GRAVEDAD  0.8f

GFXcanvas16* canvas = nullptr;

// ===== Sprites (# = pixel pintado) =====
const char* const DINO_CUERPO[20] = {
  "..........############",
  "..........############",
  "..........##.#########",
  "..........############",
  "..........############",
  "..........#########...",
  "..........######......",
  ".........########.....",
  "........#########.....",
  ".......###########....",
  "....##############....",
  ".####################.",
  "#################..##.",
  "..###############.....",
  "....#############.....",
  ".....############.....",
  "......##########......",
  ".......#########......",
  "........########......",
  "........########......"
};
const char* const PIERNAS_1[4] = {
  "........###..###......",
  "........###..####.....",
  "........###...........",
  "........####.........."
};
const char* const PIERNAS_2[4] = {
  "........###..###......",
  "........####.###......",
  ".............###......",
  ".............####....."
};
const char* const PIERNAS_QUIETO[4] = {
  "........###..###......",
  "........###..###......",
  "........###..###......",
  "........####.####....."
};
const char* const CACTUS[16] = {
  "...###...",
  "...###...",
  "...###...",
  "...###...",
  "##.###.##",
  "##.###.##",
  "##.###.##",
  "##.###.##",
  "#########",
  "#########",
  "...###...",
  "...###...",
  "...###...",
  "...###...",
  "...###...",
  "...###..."
};

// ===== Estado del juego =====
float dinoY = 0, dinoVy = 0;
bool enSuelo = true;
float velocidad = 5.5f, distancia = 0, scrollSuelo = 0, distSpawn = 100;
uint32_t frames = 0;

struct Cactus { float x; uint8_t filas; bool activo; };
Cactus cactus[4];

struct Nube { float x; float y; };
Nube nubes[3] = {{40, 20}, {170, 34}, {290, 12}};

// ===== Utilidades =====
void textoCentrado(const char* txt, int y, uint8_t tam) {
  int w = strlen(txt) * 6 * tam;
  tft.setTextSize(tam);
  tft.setTextColor(COL_OBJ, COL_FONDO);
  tft.setCursor((320 - w) / 2, y);
  tft.print(txt);
}

void dibujarSprite(const char* const* filas, int n, int x, int y, uint16_t color) {
  for (int r = 0; r < n; r++) {
    const char* f = filas[r];
    int c = 0;
    while (f[c]) {
      if (f[c] == '#') {
        int ini = c;
        while (f[c] == '#') c++;
        canvas->fillRect(x + ini * ESC, y + r * ESC, (c - ini) * ESC, ESC, color);
      } else {
        c++;
      }
    }
  }
}

bool botonPresionado() {
  return !digitalRead(BTN_NEGRO) || !digitalRead(BTN_BLANCO) ||
         !digitalRead(BTN_ROJO)  || !digitalRead(BTN_SW);
}

void saltar() {
  if (enSuelo) { enSuelo = false; dinoVy = V_SALTO; }
}

// ===== Logica =====
void actualizar() {
  frames++;
  velocidad = min(9.0f, 5.5f + frames / 600.0f);   // acelera poco a poco
  distancia += velocidad;
  scrollSuelo += velocidad;

  // Nubes (mas lentas que el suelo)
  for (auto &n : nubes) {
    n.x -= velocidad * 0.25f;
    if (n.x < -50) { n.x = CW + random(0, 120); n.y = random(8, 40); }
  }

  // Cactus: avanzan hacia la izquierda
  for (auto &c : cactus) {
    if (!c.activo) continue;
    c.x -= velocidad;
    if (c.x < -24) c.activo = false;
  }
  distSpawn -= velocidad;
  if (distSpawn <= 0) {
    for (auto &c : cactus) {
      if (!c.activo) { c.activo = true; c.x = CW + 4; c.filas = random(12, 17); break; }
    }
    distSpawn = velocidad * 21 + 80 + random(0, 140);   // siempre da tiempo a aterrizar
  }

  // Piloto automatico: salta cuando el cactus esta a la distancia justa
  if (enSuelo) {
    float frente = DINO_X + 34;                 // punta del pie del dinosaurio
    float hueco0 = velocidad * 10.5f - 18;      // distancia ideal para empezar el salto
    for (auto &c : cactus) {
      if (!c.activo) continue;
      float hueco = c.x - frente;
      if (hueco > 0 && hueco <= hueco0) { saltar(); break; }
    }
  }

  // Fisica del salto
  if (!enSuelo) {
    dinoY += dinoVy;
    dinoVy -= GRAVEDAD;
    if (dinoY <= 0) { dinoY = 0; dinoVy = 0; enSuelo = true; }
  }
}

// ===== Dibujo =====
void dibujar() {
  canvas->fillScreen(COL_FONDO);

  // Nubes
  for (auto &n : nubes) {
    canvas->fillRoundRect((int)n.x, (int)n.y, 44, 9, 4, COL_TENUE);
    canvas->fillRoundRect((int)n.x + 10, (int)n.y - 5, 22, 9, 4, COL_TENUE);
  }

  // Suelo: linea + pedacitos que se mueven
  canvas->drawFastHLine(0, SUELO_Y, CW, COL_OBJ);
  int desp = (int)scrollSuelo;
  for (int x = 0; x < CW; x++) {
    uint32_t k = (uint32_t)(x + desp);
    k = (k ^ 61) ^ (k >> 16); k *= 9; k ^= k >> 4; k *= 0x27d4eb2d; k ^= k >> 15;
    if ((k & 31) == 0) {
      canvas->drawFastHLine(x, SUELO_Y + 5 + ((k >> 5) % 3) * 4, 2 + ((k >> 8) & 3), COL_TENUE);
    }
  }

  // Cactus (los bajos usan solo las ultimas filas del sprite)
  for (auto &c : cactus) {
    if (!c.activo) continue;
    dibujarSprite(&CACTUS[16 - c.filas], c.filas, (int)c.x, SUELO_Y - c.filas * ESC, COL_OBJ);
  }

  // Dinosaurio
  int yDino = SUELO_Y - 24 * ESC - (int)dinoY;
  dibujarSprite(DINO_CUERPO, 20, DINO_X, yDino, COL_OBJ);
  const char* const* piernas = !enSuelo ? PIERNAS_QUIETO : (((frames / 4) % 2) ? PIERNAS_2 : PIERNAS_1);
  dibujarSprite(piernas, 4, DINO_X, yDino + 20 * ESC, COL_OBJ);

  // Marcador
  char b[8];
  snprintf(b, sizeof(b), "%05d", (int)(distancia / 10));
  canvas->setTextSize(2);
  canvas->setTextColor(COL_OBJ);
  canvas->setCursor(CW - 5 * 12 - 6, 4);
  canvas->print(b);
}

// Manda el canvas completo a la pantalla de un solo golpe
void empujarCanvas() {
  tft.startWrite();
  tft.setAddrWindow(0, Y_CANVAS, CW, CH);
  tft.writePixels(canvas->getBuffer(), (uint32_t)CW * CH);
  tft.endWrite();
}

void dibujarFijo() {
  tft.fillScreen(COL_FONDO);
  textoCentrado("DINOBOTICS", 6, 4);
  textoCentrado("TECNM - DINO PAD 1.0", 46, 2);
  textoCentrado("CUALQUIER BOTON = SALTAR", 192, 2);
}

void mostrarFps(int fps) {
  char b[16];
  snprintf(b, sizeof(b), "FPS: %2d", fps);
  textoCentrado(b, 216, 2);
  Serial.printf("FPS: %d\n", fps);
}

void setup() {
  Serial.begin(115200);
  delay(300);

  // Otros dispositivos del bus SPI: inactivos
  pinMode(TOUCH_CS, OUTPUT); digitalWrite(TOUCH_CS, HIGH);
  pinMode(SD_CS, OUTPUT);    digitalWrite(SD_CS, HIGH);
  pinMode(BTN_NEGRO, INPUT_PULLUP);
  pinMode(BTN_BLANCO, INPUT_PULLUP);
  pinMode(BTN_ROJO, INPUT_PULLUP);
  pinMode(BTN_SW, INPUT_PULLUP);

#if DRIVER == 0
  tft.begin(SPI_FREQ);
#else
  tft.init(240, 320);
  tft.setSPISpeed(SPI_FREQ);
#endif
  tft.setRotation(ROTACION);
uint8_t madctl = 0x68;   // MX | MV | BGR  → prueba este primero
tft.sendCommand(0x36, &madctl, 1);
  Serial.printf("W=%d H=%d\n", tft.width(), tft.height());
tft.drawRect(0, 0, tft.width(), tft.height(), COL_OBJ);
  tft.fillScreen(COL_FONDO);

  canvas = new GFXcanvas16(CW, CH);
  Serial.printf("Heap libre: %u | bloque mayor: %u\n",
                (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMaxAllocHeap());
  if (!canvas->getBuffer()) {
    Serial.println("ERROR: sin memoria para el canvas (necesita ~70 KB seguidos).");
    textoCentrado("SIN MEMORIA", 100, 3);
    while (true) delay(1000);
  }

  dibujarFijo();
  Serial.println("Animacion lista.");
}

void loop() {
  uint32_t t0 = millis();

  // Cualquier boton (o la perilla) hace saltar
  static bool previo = false;
  bool pres = botonPresionado();
  if (pres && !previo) saltar();
  previo = pres;

  actualizar();
  dibujar();
  empujarCanvas();

  // FPS una vez por segundo
  static uint32_t tFps = 0;
  static int cuenta = 0;
  cuenta++;
  if (millis() - tFps >= 1000) {
    mostrarFps(cuenta);
    cuenta = 0;
    tFps = millis();
  }

  // ~30 cuadros por segundo
  uint32_t dt = millis() - t0;
  if (dt < 33) delay(33 - dt);
}