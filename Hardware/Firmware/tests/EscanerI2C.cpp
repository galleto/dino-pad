#include <Arduino.h>
#include <Wire.h>

#define PIN_SDA 21
#define PIN_SCL 22

// Prototipos de funciones
void setup();
void loop();

void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);
}

void loop() {
  Serial.println("\nEscaneando I2C...");
  int encontrados = 0;
  for (byte dir = 1; dir < 127; dir++) {
    Wire.beginTransmission(dir);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  Dispositivo en 0x%02X", dir);
      if (dir == 0x57) Serial.print("  <- MAX30102");
      if (dir == 0x68 || dir == 0x69) Serial.print("  <- MPU6050");
      Serial.println();
      encontrados++;
    }
  }
  if (encontrados == 0) Serial.println("  No se encontro nada: revisa SDA, SCL, GND y alimentacion.");
  delay(3000);
}
