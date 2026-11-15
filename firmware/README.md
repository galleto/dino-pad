# Firmware ESP32 de Dinopad

Sketches de Arduino para un ESP32 (placa `esp32:esp32:esp32`) con pantalla
ILI9341 de 2.8" y conexión BLE a un SenseCAP Card Tracker T1000-E con Meshtastic.

| Carpeta | Qué hace |
|---|---|
| `ble_send/` | Se conecta por BLE al T1000-E con PIN, lee su configuración y telemetría (Nanopb) y las muestra en la pantalla. Con `ENVIAR_MENSAJE = true` manda **un** mensaje de texto por broadcast. |
| `ble_scan/` | Escáner BLE: lista los nodos Meshtastic cercanos (sin repetidos) y marca el T1000-E objetivo. |
| `dinopad/` | Panel de telemetría por Wi-Fi + MQTT, con tres botones (ping, sensores simulados, SOS). |
| `dinopad_pipboy/` | Menú de 5 pestañas con los 3 botones y datos del T1000-E por BLE (5 etapas; ver abajo). Con `secretos.h`, Wi-Fi + MQTT (TLS) a la base en la nube; sin él, sin red. Por LoRa solo envía si `ENVIAR_MENSAJE = true`. |
| `test_ble_minimo/` | Solo `NimBLEDevice::init()` e imprime "BLE OK": para ver si una placa aguanta encender el BLE (brownout). |
| `test_botones/` | Encuentra a qué GPIO está soldado cada botón (muestra "GPIO n" al presionar). |
| `test_rotacion/`, `test_geometria/`, `test_madctl/` | Pruebas de la pantalla que se usaron para encontrar la orientación correcta. |
| `libraries/dinopad_pines/` | `pines.h`: **único** lugar con los pines de la pantalla y los botones y la orientación del panel. |

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

### Código de Nanopb (solo `ble_send`)

`ble_send/src/mtpb/` **no está en el repo** (está en `firmware/.gitignore`), porque
se genera a partir de archivos GPL-3.0 (ver Licencias). Antes de compilar
`ble_send` por primera vez, genéralo (necesita `protoc`, `python3` e internet):

```sh
firmware/ble_send/tools/generar_nanopb.sh
```

El script lo genera en `ble_send/src/mtpb/` y copia lo mismo a
`dinopad_pipboy/src/mtpb/` (los dos están en `firmware/.gitignore`).

## Compilar

Desde la raíz del repo. `--libraries firmware/libraries` es necesario para que
los sketches encuentren `pines.h`:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 --libraries firmware/libraries firmware/ble_send
arduino-cli compile --fqbn esp32:esp32:esp32 --libraries firmware/libraries firmware/dinopad
arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=huge_app --libraries firmware/libraries firmware/dinopad_pipboy
arduino-cli compile --fqbn esp32:esp32:esp32 --libraries firmware/libraries firmware/test_botones
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/ble_scan
```

Uso aproximado de flash: `ble_send` 51 %, `ble_scan` 45 %, `dinopad` 71 %.
`dinopad_pipboy` con red usa 1.35 MB: **no cabe** en la partición normal (1.31 MB), por eso
se compila y se sube con `PartitionScheme=huge_app` (3 MB, sin OTA). Sin `secretos.h`, 0.76 MB.

## Subir a la placa y ver el serial

El puerto `/dev/ttyUSB0` puede cambiar a `ttyUSB1` si el USB se reconecta.
Es mejor usar la ruta fija de `/dev/serial/by-id/`:

```sh
ls /dev/serial/by-id/
# ej.: usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0

arduino-cli upload -p /dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0 \
    --fqbn esp32:esp32:esp32 firmware/ble_send   # sube lo ultimo compilado
arduino-cli monitor -p /dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0 \
    -c baudrate=115200
```

Tu usuario debe estar en el grupo `uucp` (en Arch/CachyOS) para usar el puerto sin sudo.

> Si también tienes el T1000-E conectado por USB, aparece como
> `usb-Seeed_Studio_T1000-E-...` (`/dev/ttyACM0`). **No le subas sketches del ESP32.**

## Hardware

Todos los pines están en `libraries/dinopad_pines/src/pines.h`. Placa: ESP32
clásico (ESP32-D0WD-V3). Pantalla ILI9341 por SPI (VSPI: SCK 18, MOSI 23, MISO 19):

| Señal | GPIO | Constante en `pines.h` |
|---|---|---|
| Pantalla CS / DC / RST | 5 / 2 / 4 | `PIN_TFT_CS`, `PIN_TFT_DC`, `PIN_TFT_RST` |
| Botón NEGRO | 13 | `PIN_BTN_NEGRO` |
| Botón BLANCO | 26 | `PIN_BTN_BLANCO` |
| Botón ROJO | 14 | `PIN_BTN_ROJO` |

Los botones van a GND (`INPUT_PULLUP`, presionado = LOW). Se midieron con
`test_botones`; el sketch original tenía BLANCO y ROJO al revés (14 y 26).

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
| `PASO_DIAG` | `'0'` | Diagnóstico de brownout: `'A'` BLE retrasado 3 s, `'B'` + potencia TX −12 dBm, `'C'` + escaneo pasivo, `'D'` + CPU 80 MHz. `'0'` = normal. Ninguno evitó el brownout (ver Registro de placas). |

Notas:
- El T1000-E solo acepta un cliente BLE a la vez: desconecta la app del celular mientras usas el ESP32.
- La temperatura y la luz del T1000-E solo llegan si en la app está activo
  *Telemetry → Environment measurement enabled*. La luz llega en una escala de 0 a 100, no en lux.
- Fuentes: [API de cliente de Meshtastic](https://meshtastic.org/docs/development/device/client-api/),
  [configuración Bluetooth](https://meshtastic.org/docs/configuration/radio/bluetooth/),
  [telemetría](https://meshtastic.org/docs/configuration/module/telemetry/).

## `dinopad_pipboy`: menú con botones y datos del tracker

| Botón | Acción |
|---|---|
| NEGRO | pestaña anterior (al soltar); dentro de TRACK: página anterior; dentro de MENS: mensaje anterior |
| BLANCO | pestaña siguiente (al soltar); dentro de TRACK: página siguiente; dentro de MENS: mensaje siguiente |
| ROJO corto | entrar a la pestaña |
| ROJO largo (0.8 s) | volver / cerrar SOS |
| NEGRO + BLANCO 3 s | pantalla de SOS y, con red, **alerta SOS a la base** (`dinopad/alertas`). El SOS del guion `demo.h` nunca se envía |

Pestañas: ESTADO, AMBIENTE, TRACK, VITAL, MENS. Etapas:

| Etapa | Pestaña | Estado |
|---|---|---|
| 1 | ESTADO: conexión, RSSI, batería, voltaje, uso de canal, uptime (con colores y antigüedad; gris si es viejo) + reconexión automática | hecha; probada en `82:a4`: llega a CONECTADO |
| 2 | AMBIENTE: "TEMP AMBIENTE" y luz (0-100), cada una con valor, antigüedad y gráfica de los últimos 30 min (historial de 60 muestras) | compila y pasa pruebas en PC; NO probado en la placa |
| 3 | TRACK: posición propia (lat/lon, sats, altitud, antigüedad) con rótulo **GPS**; sin fix, coordenadas **DEMO** (letrero amarillo) de la base en el cráter Jezero (Marte) y 2 tripulantes simulados, todo en `posicion_demo.h`; lista de nodos (nombre corto, id, saltos, hace cuánto se oyó, MQTT) en páginas de 8, ordenada por el más reciente. **No guarda ni muestra la posición de otros nodos** | compila y pasa pruebas en PC; NO probado en la placa |
| 4 | VITAL: BPM y SpO2 **simulados** (aviso "DEMO" amarillo), número con semáforo NORMAL / ATENCION / CRITICO con los rangos de `backend/data/crew.json`, y gráfica de 2 min con los límites del rango normal. Simulador en `simulador_vital.h`, listo para cambiarlo por el MAX30102 | compila y pasa pruebas en PC; NO probado en la placa |
| 5 | MENS: 8 mensajes predeterminados (`mensajes.h`); dentro, NEGRO/BLANCO eligen y ROJO corto lo envía por el T1000-E (broadcast, canal primario, con seguimiento de cola y ACK) **solo si `ENVIAR_MENSAJE = true`**; queda en `false` | compila y pasa pruebas en PC; NO probado en la placa |

### Red: Wi-Fi + MQTT a la base en la nube (`red_mqtt.*`)

1. Copia `firmware/dinopad_pipboy/secretos.ejemplo.h` como `secretos.h` y llénalo (Wi-Fi,
   host y usuario de HiveMQ Cloud, `CREW_ID`). `secretos.h` está en `.gitignore`.
2. Compila y sube con `PartitionScheme=huge_app` (ver arriba).

La red corre en su propia tarea (núcleo 1); `loop()` nunca la espera. Orden: Wi-Fi → hora por
NTP (TLS la necesita para validar el certificado `ca_raiz.h`, ISRG Root X1) → broker. El pie de
la pantalla y el serial dicen `RED: WIFI / HORA / BROKER / CONECTADA`.

| Tema | Qué manda | Origen |
|---|---|---|
| `dinopad/vitals` | BPM y SpO₂ cada 2 s | **simulados** por el ESP32 (`source: "simulated"`, la web dice DEMO) |
| `dinopad/alertas` | `{"type":"sos"}` al sostener NEGRO + BLANCO 3 s | persona (nunca `demo.h`) |
| `dinopad/estado` | batería, voltaje, RSSI BLE, uso de canal, airTx, uptime, temp. ambiente y luz del T1000-E, cada 30 s | **reales** (`source: "live"`); sin batería leída no se manda |
| `dinopad/ui` | pestaña, modo y último evento (`demo: true` si lo generó el guion), en cada evento y cada 15 s | real |

Sin botones: con `DEMO_AUTOMATICO = true` (en `dinopad_pipboy.ino`) el menú se recorre
solo siguiendo `demo.h` (pulsaciones simuladas, no datos); ponlo en `false` cuando la placa
tenga botones. Mientras está activa, la barra de título muestra "DEMO AUTO" en amarillo y
el pie dice "Ultimo DEMO:" en los eventos generados por el guion.

Datos simulados (todos con rótulo DEMO amarillo): BPM y SpO2 de VITAL
(`simulador_vital.h`) y, sin fix de GPS, la base y los tripulantes de TRACK
(`posicion_demo.h`). Lo demás (ESTADO, AMBIENTE, nodos de TRACK) es real del T1000-E.

Pruebas en la PC (solo g++): `test/verificar_botones.sh`, `test/verificar_historial.sh`,
`test/verificar_nodos.sh`, `test/verificar_vitales.sh` y `test/verificar_posicion.sh`.

Con `ENVIAR_MENSAJE = true`, solo ROJO (botón real) envía por radio, con 30 s mínimo entre
envíos. El guion de `DEMO_AUTOMATICO` **nunca** envía por radio: el envío se simula en
pantalla ("Ultimo DEMO: ENVIO SIMULADO: …").

Arquitectura: la conexión BLE (`conexion_ble.*`) corre en una tarea FreeRTOS en el
núcleo 0 y escribe en una estructura compartida con mutex (`compartido.*`); el
`loop()` (botones y pantalla, núcleo 1) solo copia esa estructura cada 250 ms y
`ui.*` redibuja únicamente los campos que cambiaron. La única escritura al tracker
es `want_config_id` (configuración local, no sale por radio).

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

`verificar.sh` debe terminar con `IDENTICOS (29 bytes)`. `verificar_decodificador.sh`
necesita haber generado antes `ble_send/src/mtpb/` (ver arriba).

Lógica de los botones del menú (`dinopad_pipboy`), solo necesita `g++`:

```sh
firmware/dinopad_pipboy/test/verificar_botones.sh    # debe terminar con "TODO OK"
firmware/dinopad_pipboy/test/verificar_historial.sh  # historial de ambiente (AMBIENTE)
```

## Regenerar el código de Nanopb

```sh
firmware/ble_send/tools/generar_nanopb.sh            # clona meshtastic/protobufs
firmware/ble_send/tools/generar_nanopb.sh /tmp/protobufs
```

Usa nanopb 0.4.9.3 en un entorno de Python temporal y reescribe `ble_send/src/mtpb/`.

## Registro de placas

Hay varias placas ESP32 físicamente distintas; se identifican por su MAC
(`esptool --port <puerto> chip-id`), que está grabada en el chip, y se
etiquetan con los últimos dos bytes. Todas: ESP32-D0WD-V3 rev. 3.1, puente
USB CP2102 (aparece como `usb-Silicon_Labs_CP2102_..._0001`, igual en todas:
**el nombre del puerto no identifica la placa, la MAC sí**).

| Etiqueta | MAC | Qué tiene | Pruebas (14/11/2026) |
|---|---|---|---|
| `82:a4` | `48:af:f3:67:82:a4` | Botones soldados (NEGRO=13, BLANCO=26, ROJO=14) + pantalla | Con pantalla y botones: brownout en bucle dentro de `NimBLEDevice::init()` (ble_send, dinopad_pipboy, incluso con la flash borrada y el código de las 17:29). Desde el 18:46 dejó de enumerar por USB a ratos (`error -71`). **Sola, sin pantalla ni botones:** `test_ble_minimo` imprime "BLE OK" y 0 brownouts en 40 s. |
| `77:e4` | `c8:8a:7b:a9:77:e4` | Pantalla (cristal 40 MHz) | `ble_send` en modo lectura con lo que tiene conectado: 30 brownouts en 60 s, siempre ~0.4 s después de iniciar la pantalla (al iniciar el BLE); nunca llega a `[1/8]`. El USB **no** se desconecta durante los brownouts (sin mensajes del kernel). **`test_ble_minimo` con la pantalla conectada pero sin inicializarla:** 18 brownouts en 40 s, ~20 ms después de empezar `NimBLEDevice::init()`; nunca imprime "BLE OK". |

**15/11/2026 01:01 (noche del 14 al 15), `82:a4` con pantalla y sin botones (según el
usuario), alimentada por USB:** `dinopad_pipboy` de `pines-botones` (`ENVIAR_MENSAJE = false`,
`DEMO_AUTOMATICO = true`, brownout activado, sin Wi-Fi) corrió **60 s sin brownouts** (un solo
`POWERON_RESET`, el provocado por RTS para capturar desde el arranque) y llegó a **CONECTADO**
a los 18.7 s (140 paquetes de configuración). El menú siguió respondiendo mientras el BLE
leía la configuración (eventos de la demo puntuales al milisegundo). **No sabemos qué cambió**
desde las pruebas fallidas del 14/11 en esta misma placa: no se cambió el código del
brownout ni la alimentación a propósito.

**Después, misma placa `82:a4` y mismo firmware, alimentada con baterías (sin USB):
resultado OK**, según la prueba del usuario (sin captura de consola, porque el USB estaba
desconectado). Esta versión quedó marcada con el tag `demo-baterias-ok` (`bb7a774`) y sus
binarios en `firmware/releases/demo-baterias-ok/` (ver su `LEEME.md`).
**La causa de los brownouts anteriores sigue sin identificar.**

**Cambio de puerto USB de la PC (`77:e4`, pantalla conectada):** de `usb 1-3`
(donde estuvo todo el día) a `usb 1-1` (el puerto que usaba el mouse). Se detectó
como CP2102 en `/dev/ttyUSB0` sin errores `-71` ni ciclos de energía, y esptool
confirmó la MAC `c8:8a:7b:a9:77:e4`. `test_ble_minimo`: **18 brownouts en 40 s,
nunca "BLE OK"**, igual que en `usb 1-3`. Cambiar de puerto no lo resolvió;
`ble_send` no se probó en ese puerto porque el paso previo ya fallaba.

**Conclusión de estas pruebas:** el mismo `test_ble_minimo` funciona en `82:a4`
sin nada conectado (0 brownouts) y falla en `77:e4` con la pantalla conectada
aunque el sketch nunca la inicialice. El problema es el **consumo estático de la
pantalla** (sobre todo la retroiluminación) sumado al pico de corriente del radio
al encender el BLE, no el software. Posibles arreglos de hardware (revisar
antes el esquema del módulo de pantalla: en muchos el pin LED espera 3.3 V):
sacar la retroiluminación del regulador de 3.3 V del ESP32 (por ejemplo, con un
transistor desde 5 V y su resistencia), un capacitor de 100–470 µF entre 3V3 y
GND cerca del ESP32, o una fuente/cable USB que entregue más corriente.

Nota: la placa con la que `ble_send` conectó sin problemas a las 17:29 no tiene
la MAC registrada, así que no se sabe si era alguna de estas.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| `E BOD: Brownout detector was triggered` en bucle; la pantalla se pone en blanco y vuelve | Bajo voltaje al encender el Bluetooth: pines puenteados, cable USB malo o puerto débil. Desconecta y revisa el cableado. |
| La subida dice que el puerto no existe | El USB se reconectó con otro nombre. Usa la ruta de `/dev/serial/by-id/`. |
| Falla el paso `[3/8]` (emparejamiento) | PIN distinto: corrige `PIN_BLE` y pon `BORRAR_BONDS = true` una vez. |
| Falla el paso `[1/8]` o `[2/8]` | El tracker está apagado o tiene otro cliente BLE conectado. |
| Bloque blanco o textos encimados en la pantalla | Orientación incorrecta: revisa `setRotation(1)` + MADCTL `0x48`. |

## Licencias

`ble_send/src/mtpb/` (generado localmente, fuera del repo) contiene código
derivado de los `.proto` de [meshtastic/protobufs](https://github.com/meshtastic/protobufs)
(GPL-3.0) y el runtime de [nanopb](https://github.com/nanopb/nanopb) (zlib); el
script copia sus licencias en esa carpeta. El resto del repo es MIT; si
distribuyes el firmware compilado de `ble_send`, revisa cómo te afecta la GPL.
