# Firmware ESP32 de Dinopad

Sketches de Arduino para un ESP32 (placa `esp32:esp32:esp32`) con pantalla
ILI9341 de 2.8" y conexión BLE a un SenseCAP Card Tracker T1000-E con Meshtastic.

| Carpeta | Qué hace |
|---|---|
| `ble_send/` | Se conecta por BLE al T1000-E con PIN, lee su configuración y telemetría (Nanopb) y las muestra en la pantalla. Con `ENVIAR_MENSAJE = true` manda **un** mensaje de texto por broadcast. |
| `ble_scan/` | Escáner BLE: lista los nodos Meshtastic cercanos (sin repetidos) y marca el T1000-E objetivo. |
| `dinopad/` | Panel de telemetría por Wi-Fi + MQTT, con tres botones (ping, sensores simulados, SOS). |
| `test_rotacion/`, `test_geometria/`, `test_madctl/` | Pruebas de la pantalla que se usaron para encontrar la orientación correcta. |

## Requisitos

- [arduino-cli](https://arduino.github.io/arduino-cli/) (probado con 1.5.1)
- Core ESP32 3.3.12
- Librerías (versiones probadas):

| Librería | Versión | La usa |
|---|---|---|
| NimBLE-Arduino | 2.5.2 | `ble_send`, `ble_scan` |
| Adafruit GFX Library | 1.13.0 | `ble_send`, `dinopad`, tests |
| Adafruit ILI9341 | 1.7.0 | `ble_send`, `dinopad`, tests |
| Adafruit BusIO | 1.17.4 | dependencia de las Adafruit |
| PubSubClient | 2.8 | `dinopad` |

Instalación (funciona igual en bash y en fish):

```sh
arduino-cli core update-index
arduino-cli core install esp32:esp32@3.3.12
arduino-cli lib install "NimBLE-Arduino@2.5.2" "Adafruit GFX Library@1.13.0" \
    "Adafruit ILI9341@1.7.0" "Adafruit BusIO@1.17.4" "PubSubClient@2.8"
```

El código de Nanopb ya viene generado en `ble_send/src/mtpb/`, así que no hace
falta instalar nada más para compilar.

## Compilar

Desde la raíz del repo:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/ble_send
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/ble_scan
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/dinopad
```

Uso aproximado de flash: `ble_send` 51 %, `ble_scan` 45 %, `dinopad` 71 %.

## Subir a la placa y ver el serial

El puerto `/dev/ttyUSB0` puede cambiar a `ttyUSB1` si el USB se reconecta.
Es mejor usar la ruta fija de `/dev/serial/by-id/`:

```sh
ls /dev/serial/by-id/
# ej.: usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0

arduino-cli upload -p /dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0 \
    --fqbn esp32:esp32:esp32 firmware/ble_send
arduino-cli monitor -p /dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0 \
    -c baudrate=115200
```

Tu usuario debe estar en el grupo `uucp` (en Arch/CachyOS) para usar el puerto sin sudo.

> Si también tienes el T1000-E conectado por USB, aparece como
> `usb-Seeed_Studio_T1000-E-...` (`/dev/ttyACM0`). **No le subas sketches del ESP32.**

## Hardware

Pantalla ILI9341 por SPI (pines SPI por defecto del ESP32: SCK 18, MOSI 23, MISO 19):

| Señal | GPIO |
|---|---|
| CS | 5 |
| DC | 2 |
| RST | 4 |
| Botón negro / blanco / rojo (`dinopad`) | 13 / 14 / 26 (a GND, con `INPUT_PULLUP`) |

**Orientación:** este panel se comporta como 320×240 "nativo". La combinación que
funciona (encontrada con `test_geometria` y `test_madctl`) es:

```cpp
tft.setRotation(1);                 // la librería queda en 320x240
uint8_t madctl = 0x48;
tft.sendCommand(0x36, &madctl, 1);  // JUSTO después de setRotation
```

Si después se vuelve a llamar a `setRotation`, se pierde el 0x48. El SPI va a 10 MHz.
Los dos diseños (`ble_send` y `dinopad`) están hechos para 320×240.

## `ble_send`: configuración

Al principio de `ble_send/ble_send.ino`:

| Constante | Valor | Para qué |
|---|---|---|
| `ENVIAR_MENSAJE` | `false` | `true` manda `MENSAJE` una vez por arranque. **Cada reinicio de la placa lo vuelve a mandar.** |
| `MENSAJE` | `"prueba dinopad"` | Máximo 233 bytes. Sale por broadcast en el canal primario. Si es el canal por defecto, cualquiera puede leerlo. |
| `PIN_BLE` | `123456` | PIN de emparejamiento del tracker (`FIXED_PIN`). Cámbialo si cambias el PIN en la app. |
| `MAC_TEXTO` | MAC del T1000-E | El tracker al que se conecta. |
| `VOLCADO_CONFIG` | `true` | Imprime cada paquete de la configuración inicial. |
| `BORRAR_BONDS` | `false` | `true` borra los emparejamientos guardados en el ESP32 (úsalo si cambiaste el PIN). |

Notas:
- El T1000-E solo acepta un cliente BLE a la vez: desconecta la app del celular mientras usas el ESP32.
- La temperatura y la luz del T1000-E solo llegan si en la app está activo
  *Telemetry → Environment measurement enabled*. La luz llega en una escala de 0 a 100, no en lux.
- Fuentes: [API de cliente de Meshtastic](https://meshtastic.org/docs/development/device/client-api/),
  [configuración Bluetooth](https://meshtastic.org/docs/configuration/radio/bluetooth/),
  [telemetría](https://meshtastic.org/docs/configuration/module/telemetry/).

## `dinopad`: Wi-Fi y broker MQTT

Edita `ssid`, `password` y `mqtt_server` (IP de la PC con el broker) en `dinopad/dinopad.ino`.
Broker Mosquitto en la PC:

```sh
printf 'listener 1883 0.0.0.0\nallow_anonymous true\n' | sudo tee -a /etc/mosquitto/mosquitto.conf
sudo systemctl enable --now mosquitto
sudo ufw allow from 10.0.0.0/8 to any port 1883 proto tcp   # si usas ufw
mosquitto_sub -h localhost -t 'dinopad/#' -v
```

`allow_anonymous true` es solo para pruebas. Algunas redes (universidades) no
dejan que los dispositivos se vean entre sí; en ese caso usa un hotspot.

## Pruebas en la PC (sin placa)

Requieren `protoc`, `gcc` y `g++`, y los `.proto` oficiales:

```sh
git clone --depth 1 https://github.com/meshtastic/protobufs.git /tmp/protobufs
firmware/ble_send/test/verificar.sh /tmp/protobufs                # mensajes ToRadio armados a mano
firmware/ble_send/test/verificar_decodificador.sh /tmp/protobufs  # decodificador FromRadio (Nanopb)
```

`verificar.sh` debe terminar con `IDENTICOS (29 bytes)`.

## Regenerar el código de Nanopb

```sh
firmware/ble_send/tools/generar_nanopb.sh            # clona meshtastic/protobufs
firmware/ble_send/tools/generar_nanopb.sh /tmp/protobufs
```

Usa nanopb 0.4.9.3 en un entorno de Python temporal y reescribe `ble_send/src/mtpb/`.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| `E BOD: Brownout detector was triggered` en bucle; la pantalla se pone en blanco y vuelve | Bajo voltaje al encender el Bluetooth: pines puenteados, cable USB malo o puerto débil. Desconecta y revisa el cableado. |
| La subida dice que el puerto no existe | El USB se reconectó con otro nombre. Usa la ruta de `/dev/serial/by-id/`. |
| Falla el paso `[3/8]` (emparejamiento) | PIN distinto: corrige `PIN_BLE` y pon `BORRAR_BONDS = true` una vez. |
| Falla el paso `[1/8]` o `[2/8]` | El tracker está apagado o tiene otro cliente BLE conectado. |
| Bloque blanco o textos encimados en la pantalla | Orientación incorrecta: revisa `setRotation(1)` + MADCTL `0x48`. |

## Licencias

`ble_send/src/mtpb/` contiene código generado a partir de los `.proto` de
[meshtastic/protobufs](https://github.com/meshtastic/protobufs) (GPL-3.0) y el
runtime de [nanopb](https://github.com/nanopb/nanopb) (zlib). Sus licencias están
en esa carpeta. El resto del repo es MIT; si distribuyes el firmware compilado,
revisa cómo te afecta la GPL.
