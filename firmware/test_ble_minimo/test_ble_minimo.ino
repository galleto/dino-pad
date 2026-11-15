// test_ble_minimo: lo minimo para encender el BLE (NimBLE) y ver si hay brownout.
// Sin pantalla, sin pines, sin escaneo ni conexion. El detector de brownout
// queda como viene.

#include <NimBLEDevice.h>

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\ntest_ble_minimo: antes de NimBLEDevice::init");
  NimBLEDevice::init("x");
  Serial.println("BLE OK");
}

void loop() {
  static uint32_t t = 0;
  if (millis() - t >= 5000) {
    t = millis();
    Serial.printf("vivo %lu s\n", (unsigned long)(millis() / 1000));
  }
  delay(10);
}
