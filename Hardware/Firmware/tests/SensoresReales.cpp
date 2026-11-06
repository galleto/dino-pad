#include <Wire.h>
#include "MAX30105.h"          // esta libreria tambien sirve para el MAX30102
#include "spo2_algorithm.h"

#define PIN_SDA 21
#define PIN_SCL 22
#define UMBRAL_DEDO 50000      // IR menor a esto = no hay dedo

MAX30105 sensor;

uint32_t irBuf[100];
uint32_t redBuf[100];
int32_t spo2;  int8_t spo2Valido;
int32_t fc;    int8_t fcValida;

void leerMuestra(int i) {
  while (!sensor.available()) sensor.check();
  redBuf[i] = sensor.getRed();
  irBuf[i]  = sensor.getIR();
  sensor.nextSample();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Wire.begin(PIN_SDA, PIN_SCL);

  if (!sensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("ERROR: no se detecta el MAX30102. Revisa VIN=3.3V, GND, SDA=21, SCL=22.");
    while (true) delay(1000);
  }
  Serial.println("MAX30102 detectado.");
  Serial.println("Pon la yema del dedo sobre el sensor, sin apretar, y quedate quieto.");

  // brillo LED (0-255), promedio, modo (2 = rojo+IR), muestras/s, ancho de pulso, rango ADC
  sensor.setup(60, 4, 2, 100, 411, 4096);

  // Primeras 100 muestras (~4 s)
  for (int i = 0; i < 100; i++) leerMuestra(i);
}

void loop() {
  // Ventana deslizante: descarta 25 muestras viejas y toma 25 nuevas (~1 s)
  for (int i = 25; i < 100; i++) {
    redBuf[i - 25] = redBuf[i];
    irBuf[i - 25]  = irBuf[i];
  }
  for (int i = 75; i < 100; i++) leerMuestra(i);

  maxim_heart_rate_and_oxygen_saturation(irBuf, 100, redBuf, &spo2, &spo2Valido, &fc, &fcValida);

  uint32_t ir = irBuf[99];
  if (ir < UMBRAL_DEDO) {
    Serial.printf("IR=%lu -> sin dedo\n", (unsigned long)ir);
    return;
  }

  Serial.printf("IR=%lu  Red=%lu  |  FC: ", (unsigned long)ir, (unsigned long)redBuf[99]);
  if (fcValida) Serial.printf("%ld lpm", (long)fc); else Serial.print("---");
  Serial.print("  |  SpO2: ");
  if (spo2Valido) Serial.printf("%ld %%", (long)spo2); else Serial.print("---");
  Serial.println();
}