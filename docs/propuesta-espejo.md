# PROPUESTA · Espejo exacto del DINO PAD y telemetría del tracker en la web

Estado: **propuesta, no implementada**. Requiere cambios de firmware y de contrato, que la
rama `web-wow` no toca.

## Qué hay hoy
La vista "DINO PAD" de la web es un **gemelo**: vuelve a dibujar la pantalla de 320×240 con
la misma lógica del firmware (`frontend/src/dinopad/`, portada de `ui.cpp`, `botones.cpp`,
`demo.h` y `posicion_demo.h` de la rama `pines-botones`). No ve la pantalla física: si
alguien pulsa un botón real, la web no se entera.

Datos del gemelo hoy:
- **VITAL** (BPM, SpO₂): las lecturas que ya tiene la web. REAL solo si `source` es `"live"`.
- **ESTADO, AMBIENTE y nodos de TRACK**: simulados en el navegador y rotulados DEMO,
  porque el contrato no trae esos campos.
- **Base y tripulantes de TRACK**: las coordenadas DEMO de `posicion_demo.h`.

## Propuesta 1: publicar el estado de la interfaz (espejo exacto)
El firmware publicaría un mensaje pequeño cada vez que cambia el menú:

```json
{ "type": "ui", "crewId": "comandante", "tab": 3, "mode": "DENTRO",
  "cursorMens": 0, "pageTrack": 0, "lastEvent": "SELECCIONAR", "demoAuto": false,
  "sosTest": false, "timestamp": 1731640000000, "source": "live" }
```

Con eso la web dibuja exactamente lo que muestra el dispositivo (ya tiene el renderizador).
Camino sugerido: Wi-Fi/MQTT (ya existe en `firmware/dinopad` y en `backend/mqtt_client.py`),
con un tema nuevo (por ejemplo `dinopad/<crewId>/ui`) y un WebSocket `/ws/device`.
LoRa no conviene para esto: demasiados mensajes para el uso de canal.

## Propuesta 2: telemetría del tracker
Mensaje por minuto con lo que el ESP32 ya lee del T1000-E por BLE:

```json
{ "type": "device", "crewId": "comandante", "ble": "CONECTADO", "rssi": -58,
  "battery": 87, "voltage": 4.02, "channelUtil": 3.1, "airTx": 0.4, "uptime": 11520,
  "ambientTemp": 22.6, "light": 58, "timestamp": 1731640000000, "source": "live" }
```

`ambientTemp` es la temperatura del entorno y **no** debe mezclarse con el indicador `temp`
(temperatura corporal). También resolvería "Estado del wearable" en Emergencia (batería y RSSI
hoy "Sin datos").

## A confirmar contra el dispositivo
- La fuente de 5×7 del gemelo se transcribió de la fuente clásica de Adafruit GFX. Conviene
  comparar una foto de la pantalla real con la réplica.
- Colores: conversión de RGB565 a RGB888 de los `#define` de `ui.cpp`.
