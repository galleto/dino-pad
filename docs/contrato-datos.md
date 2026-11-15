# Contrato de datos: DINO PAD (ESP32) ↔ backend ↔ página web

Estado al 14/11/2026, leído de `origin/main` (commit `14731e8`). Las secciones
marcadas **PROPUESTA** todavía no existen en el código y necesitan acuerdo de
quien mantiene `backend/` y `frontend/`.

## 1. Cómo entran hoy los datos

```
 ESP32 (dinopad) ─┐
                  ├─ MQTT 3.1.1 ─▶ broker :1883 ─▶ backend FastAPI :8000 ─┬─ REST  ─▶ frontend (React)
 simulator.py ────┘   (JSON)       (Mosquitto o       │ valida (pydantic)  └─ WebSocket
                                    MiniMQTTBroker)   │ guarda (TimescaleDB, o en memoria)
                                                      │ reglas de alerta + explicación Gemini
```

- **El navegador no habla MQTT.** El frontend solo usa REST y WebSocket del
  backend (`VITE_API_URL=http://localhost:8000`, `VITE_WS_URL=ws://localhost:8000`).
  Si `/health` no responde, el frontend usa su **simulador local** (`services/simulator.js`)
  y marca la conexión como `simulator`.
- **Broker:** `MQTT_HOST` / `MQTT_PORT` del `.env` del backend (por defecto
  `localhost:1883`, sin usuario, sin TLS). Para pruebas sin Mosquitto:
  `backend/simulator/mock_broker.py` (MiniMQTTBroker, reenvía todo a todos).
- **Generador de prueba:** `backend/simulator/simulator.py` publica en los mismos
  tópicos que usaría el ESP32 (teclas: `s` SOS, `p` ping, `a` SpO₂ 84 %).

## 2. Tópicos MQTT que escucha el backend (formato exacto)

Todos los mensajes son JSON UTF-8. `timestamp` es **epoch en milisegundos**.
Un mensaje que no valide contra el modelo se descarta con un aviso en el log.

### `dinopad/vitals` — una lectura por mensaje (`VitalReading`)

```json
{"crewId": "comandante", "indicatorId": "hr", "value": 72, "unit": "lpm",
 "timestamp": 1794700000000, "source": "simulated", "quality": "ok"}
```

| Campo | Tipo | Valores permitidos |
|---|---|---|
| `crewId` | texto | `comandante`, `botanico`, `ingeniero` |
| `indicatorId` | texto | `hr`, `spo2`, `temp`, `bp`, `glu`, `sleep`, `mood` |
| `value` | número o `null` | `null` si no hay señal |
| `unit` | texto | `lpm`, `%`, `°C`, `mmHg`, `mg/dL`, `h`, `/10` |
| `timestamp` | entero | epoch ms (**obligatorio**) |
| `source` | texto | `live` (dato real) o `simulated` (por defecto `simulated`) |
| `quality` | texto | `ok` o `no_signal` |

Indicadores (`backend/data/crew.json`), con rango normal (`ok`) y de aviso (`warn`):

| `indicatorId` | Qué es | Unidad | ok | warn |
|---|---|---|---|---|
| `hr` | Frecuencia cardíaca | `lpm` | 50–90 | 40–110 |
| `spo2` | Oxigenación | `%` | 95–100 | 90–100 |
| `temp` | **Temperatura corporal** | `°C` | 36.1–37.5 | 35.5–38.3 |
| `bp`, `glu`, `sleep`, `mood` | Presión, glucosa, sueño, ánimo | `mmHg`, `mg/dL`, `h`, `/10` | ver `crew.json` | |

### `dinopad/alertas` — botones del dispositivo (`AlertMessage`)

```json
{"crewId": "comandante", "type": "sos", "timestamp": 1794700000000}
```

`type`: `sos` o `ping`. El backend lo convierte en una alerta (ver §3).

### `dinopad/estado` — estado del dispositivo (`DeviceStatus`)

```json
{"deviceId": "dinopad-01", "crewId": "comandante", "status": "online",
 "batteryPct": 87, "rssi": -61, "timestamp": 1794700000000}
```

`batteryPct` entero 0–100 (obligatorio), `rssi` entero en dBm (obligatorio).
Hoy **solo se guarda** en la tabla `device_status`: no se reenvía al frontend
(no hay WebSocket ni endpoint REST expuesto para dispositivos).

## 3. Lo que recibe el frontend

| Canal | Contenido |
|---|---|
| `GET /api/crew` | `crew.json` completo (tripulantes, indicadores, escenarios) |
| `GET /api/vitals/latest?crewId=` | última lectura de cada indicador |
| `GET /api/vitals/history?crewId=&indicatorId=&limit=` | `[{timestamp, value, quality, ...}]` |
| `GET /api/alerts?crewId=&limit=` | alertas recientes |
| `WS /ws/vitals` | cada `VitalReading` tal cual llegó por MQTT |
| `WS /ws/alerts` | cada alerta nueva (y otra vez cuando Gemini agrega la explicación) |

Alerta (generada por `backend/rules.py`):

```json
{"id": "uuid", "timestamp": 1794700000000, "crewId": "comandante",
 "indicatorId": null, "level": "critical", "title": "SOS",
 "message": "Señal de emergencia (SOS) activada manualmente por Cmdr. Elena Vega.",
 "action": "Atención médica y de soporte vital inmediata. ...",
 "origin": "button", "aiExplanation": null}
```

`level`: `critical` / `warning` / `info`. `origin`: `rule` (lectura fuera de
rango) o `button` (SOS/ping). El backend suprime alertas repetidas del mismo
tipo durante 30 s.

## 4. Origen y hora de cada lectura

- **Origen:** `source` = `live` para todo lo medido de verdad y `simulated`
  para lo inventado. El backend **solo acepta esas dos palabras** (`real` o
  `simulado` serían rechazados, aunque `readings.js` en el navegador también
  sabría mostrarlos). En pantalla: `live` → "EN VIVO", `simulated` → "SIMULADO".
- **Hora:** `timestamp` en epoch ms, de **cuándo se midió**, no de cuándo se
  publicó. El ESP32 no tiene reloj: con Wi-Fi e internet puede sincronizar por
  NTP (`configTime`). Para datos del T1000-E, la hora real viene en el `rx_time`
  (segundos) de cada paquete Meshtastic → `rx_time * 1000`.

## 5. Qué puede venir del T1000-E y qué es simulado

| Dato | Origen | `source` | Cabe en el contrato actual |
|---|---|---|---|
| Batería del T1000-E (%) y voltaje | T1000-E, DeviceMetrics | `live` | Batería: sí, como `dinopad/estado` de otro dispositivo; voltaje: no |
| Temperatura ambiente (NTC del T1000-E) | T1000-E, EnvironmentMetrics | `live` | **No.** `temp` es temperatura **corporal**: mandarla ahí dispararía alertas críticas falsas |
| Luz (escala 0–100 del firmware, no lux) | T1000-E, EnvironmentMetrics | `live` | **No** (no hay indicador ni unidad) |
| Posición (lat/lon, si hay fix) | T1000-E, Position | `live` | **No** (no es un valor escalar) |
| BPM | Simulado hasta tener el MAX30102 | `simulated` | Sí: `hr`, `lpm` |
| SpO₂ | Simulado hasta tener el MAX30102 | `simulated` | Sí: `spo2`, `%` |

### PROPUESTA: extensión para los datos del T1000-E

Requiere cambiar `backend/models.py` (`IndicatorId`, `Unit`), `crew.json` y el
frontend. No está implementado.

1. Dos indicadores nuevos de **ambiente**, separados de los vitales:
   - `amb_temp` — "Temperatura ambiente", unidad `°C`.
   - `light` — "Luz", unidad nueva `/100`.
   Con `source: "live"` y su propio rango (o sin alerta).
2. Batería del tracker como un segundo dispositivo en `dinopad/estado`:
   `{"deviceId": "t1000e-a1e23d60", "crewId": "comandante", "status": "online",
   "batteryPct": 87, "rssi": -61, "timestamp": ...}`. Si llega 101 (USB), mandar
   100 y `status: "usb"` (el modelo exige 0–100).
3. Tópico nuevo `dinopad/posicion`:
   `{"deviceId": "t1000e-a1e23d60", "crewId": "comandante", "lat": 19.4326,
   "lon": -99.1332, "alt": 2240, "sats": 9, "timestamp": ..., "source": "live"}`.
4. Reenviar `dinopad/estado` (y `dinopad/posicion`) al frontend por un
   WebSocket o `GET /api/devices` (la función `get_devices()` ya existe en
   `db.py`, falta exponerla).
5. **Confirmación del SOS hacia el dispositivo** (`dinopad/ack`): cuando alguien
   atiende el SOS en la web, el backend publica
   `{"crewId": "comandante", "alertId": "<uuid>", "type": "sos_ack", "timestamp": ...}`
   para que el DINO PAD muestre "SOS recibido". Hoy `acknowledgeSos` solo se
   guarda en el navegador.
6. **Hora del servidor si falta la del dispositivo:** si llega `timestamp: 0`
   (el dispositivo no tenía hora NTP), el backend usa la hora de recepción. Hoy
   la alerta quedaría fechada en 1970.

## 6. Diferencias con lo que publicaba `firmware/dinopad` (antes de la rama `firmware-contrato`)

| Tópico | Lo que manda `dinopad` hoy | Lo que espera el backend | Resultado hoy |
|---|---|---|---|
| `dinopad/estado` (al conectar) | `{"device":"Dinopad","status":"ONLINE"}` | `DeviceStatus` (deviceId, crewId, status, batteryPct, rssi, timestamp) | **Rechazado** (faltan campos) |
| `dinopad/estado` (botón NEGRO) | `{"evento":"PING","uptime_s":N}` | Un ping va en `dinopad/alertas` con `type:"ping"` | **Rechazado** |
| `dinopad/sensores` (botón BLANCO) | `{"bpm":N,"spo2":N,"modo":"DEMO"}` | El backend **no escucha** `dinopad/sensores`; espera `dinopad/vitals`, una lectura por mensaje | **Ignorado** |
| `dinopad/alertas` (botón ROJO) | `{"alerta":"SOS","prioridad":"ALTA"}` | `{"crewId":..., "type":"sos", "timestamp":...}` | **Rechazado**: el SOS no llega a la web |

## 7. `firmware/dinopad` en la rama `firmware-contrato`

Ya publica según §2 (validado contra `backend/models.py` con
`firmware/dinopad/test/verificar_contrato.sh`):

| Botón / momento | Tópico | Mensaje | QoS |
|---|---|---|---|
| NEGRO | `dinopad/alertas` | `{"crewId":"comandante","type":"ping","timestamp":<ms>}` | 1, sin retain |
| BLANCO | `dinopad/vitals` ×2 | `hr` (`lpm`) y `spo2` (`%`), `"source":"simulated"`, `"quality":"ok"` | 0 |
| ROJO | `dinopad/alertas` | `{"crewId":"comandante","type":"sos","timestamp":<ms>}` | 1, sin retain |
| Cada 30 s | `dinopad/estado` | `DeviceStatus` completo (**todavía no se publica**: falta la batería, ver abajo) | 0 |

- Identidad: `CREW_ID = "comandante"`, `DEVICE_ID = "dinopad-01"` (constantes).
- MQTT con `esp-mqtt` (ESP-IDF, incluido en el core): PubSubClient no puede
  publicar con QoS 1. Los QoS 1 se encolan y, sin conexión, se mandan al reconectar.
- Hora por NTP (`pool.ntp.org`, UTC). Sin hora: las lecturas **no** se mandan;
  el SOS y el ping **sí** se mandan, con `timestamp: 0` (ver propuesta 6).
- **`dinopad/estado` no se publica todavía:** el DINO PAD no tiene pin para medir
  la batería (`Hardware/Hardware/datasheets/PINOUTS.xlsx`) y el modelo exige
  `batteryPct`. No se inventa el dato. Opciones: un divisor de voltaje a un ADC
  libre, o que el backend acepte `batteryPct` opcional.

## 8. Para el equipo: tres detalles encontrados en `backend/` y `frontend/`

1. **`ts` contra `timestamp` en las alertas.** `backend/models.py` define
   `StoredAlert.ts`, pero `backend/rules.py` construye las alertas con la clave
   `timestamp`, que es la que guarda `db.py` y la que usa el frontend. Hoy no
   falla porque `StoredAlert` no se usa para validar, pero si alguien lo empieza
   a usar, las alertas no validarán. Sugerencia: renombrar el campo a `timestamp`.
2. **El SOS se detecta por texto.** `frontend/src/App.jsx` y
   `frontend/src/components/Pages.jsx` buscan `/sos/i` en `title` y `action`.
   Una alerta de regla cuyo texto mencione "SOS" se mostraría como SOS, y un SOS
   con otro título no. Sugerencia: detectar por `origin === "button"` y
   `title === "SOS"` (o un campo `type` explícito).
3. **El "atendido" no sale del navegador.** `acknowledgeSos` solo escribe en
   `localStorage`: otra pestaña u otra persona no lo ve, y el DINO PAD tampoco.
   Sugerencia: un endpoint para confirmar el SOS que guarde el estado y publique
   la confirmación en `dinopad/ack` (propuesta 5).

## 9. PROPUESTA: puente T1000-E → broker en la PC (sin código aún)

Objetivo: que los datos reales del T1000-E (batería, temperatura ambiente, luz,
posición) lleguen al backend sin cambiar el firmware del tracker.

**Cómo leer el T1000-E desde la PC** (biblioteca oficial `meshtastic` para
Python, versión 2.7.11 en PyPI):

- Conexión por USB: `meshtastic.serial_interface.SerialInterface()` (busca el
  dispositivo solo, o se le pasa la ruta, p. ej. `/dev/ttyACM0`).
  Fuente: https://meshtastic.org/docs/development/python/library/
- Conexión por BLE: `meshtastic.ble_interface.BLEInterface(address)`; el
  emparejamiento con PIN lo hace el sistema operativo (la biblioteca solo avisa
  *"did you enter the pairing PIN on your computer?"*).
  Fuente: https://python.meshtastic.org/ble_interface.html
- Recepción con `pubsub`: `pub.subscribe(onReceive, "meshtastic.receive")`, con
  callback `onReceive(packet, interface)`. Por tipo:
  `meshtastic.receive.telemetry` y `meshtastic.receive.position` (nombres
  `"telemetry"` y `"position"` de la tabla de protocolos en
  `meshtastic/__init__.py`).
- El paquete llega como diccionario: `MessageToDict(MeshPacket)` más
  `packet["fromId"]` (p. ej. `"!a1e23d60"`) y el mensaje decodificado en
  `packet["decoded"]["telemetry"]` o `packet["decoded"]["position"]`, con los
  nombres de campo de protobuf en camelCase (`rxTime`, `deviceMetrics.batteryLevel`,
  `environmentMetrics.temperature`, `environmentMetrics.lux`, `latitudeI`…).
  Fuente: `meshtastic/mesh_interface.py`, `_handlePacketFromRadio`.
  Ojo: `MessageToDict` omite los campos con valor por defecto (p. ej. 0).

**Script propuesto** (`tools/puente_t1000e.py`, por escribir):

1. Conecta al T1000-E por USB (preferido: no compite con el BLE del ESP32,
   que solo admite un cliente a la vez) o por BLE.
2. Se suscribe a `meshtastic.receive.telemetry` y `meshtastic.receive.position`,
   y filtra los paquetes cuyo `fromId` es el nodo propio (`interface.getMyNodeInfo()`).
3. Traduce y publica al broker (con `paho-mqtt`, que el backend ya usa), con
   `source: "live"` y `timestamp = rxTime * 1000`:
   - `deviceMetrics.batteryLevel` → `dinopad/estado` (deviceId `t1000e-<nodo>`;
     101 = USB → `batteryPct: 100`, `status: "usb"`).
   - `environmentMetrics.temperature` / `lux` → `dinopad/vitals` con
     `amb_temp` / `light` (**requiere la propuesta de §5**; mientras tanto solo
     se registra en el log, para no dispararle alertas a `temp`).
   - `position` → `dinopad/posicion` (**requiere §5**).
4. No escribe nada en el tracker ni cambia su configuración.

Por verificar antes de escribirlo: si el T1000-E expone la API por USB mientras
está cargando (en esta PC apareció como `Seeed_Studio_T1000-E-BOOT`), con
`meshtastic --port /dev/ttyACM0 --info`.
