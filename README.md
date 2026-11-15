# Dinopad

Prototipo de monitoreo de salud y telemetría para una tripulación espacial. Las lecturas y recomendaciones de demostración no son datos clínicos ni deben usarse para tomar decisiones médicas.

## 1. Descripción general

Dinopad reúne una interfaz web, una API y firmware experimental para visualizar signos vitales, historial, tendencias y alertas de una tripulación. La interfaz puede funcionar por sí sola con datos sintéticos; cuando encuentra el backend, obtiene perfiles y lecturas por HTTP, y recibe cambios en tiempo real por WebSocket.

En el flujo conectado, sensores o un simulador publican mensajes JSON por MQTT. El backend valida los mensajes, evalúa reglas para generar alertas, guarda datos en TimescaleDB/PostgreSQL (o en memoria si la base de datos no está disponible) y retransmite lecturas y alertas. Las alertas críticas y de atención pueden recibir una explicación opcional de Gemini. El resultado se muestra en el panel y se conserva una caché local limitada en el navegador.

## 2. Cómo operarlo

### Requisitos previos

- Python 3 y `pip` para el backend. El proyecto no fija una versión mínima de Python. **TODO:** definir y documentar la versión de Python probada.
- Node.js y npm para el frontend, que usa React 19 y Vite 8. El manifiesto no fija una versión mínima de Node.js. **TODO:** declarar la versión recomendada.
- Opcionales para el modo conectado: broker MQTT y TimescaleDB/PostgreSQL. La clave de Gemini solo es necesaria para solicitar explicaciones con IA.
- Para compilar firmware: `arduino-cli`, core ESP32 y librerías indicadas en [`firmware/README.md`](./firmware/README.md).

### Instalación y configuración

Desde la carpeta `dino-pad`:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example .env
```

Edita `.env` solo si vas a configurar servicios externos. Variables reconocidas por el backend:

- `DATABASE_URL` o `TIMESCALE_SERVICE_URL`: conexión PostgreSQL/TimescaleDB. Si faltan o no se puede conectar, el backend opera en memoria.
- `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASSWORD`, `MQTT_TLS`: conexión al broker; por defecto usa `localhost:1883`.
- `GEMINI_APIKEY` y `GEMINI_MODEL`: explicaciones opcionales de alertas.

Para el frontend, copia opcionalmente `frontend\.env.example` a `frontend\.env.local` y configura `VITE_API_URL` y `VITE_WS_URL` si el backend no está en `http://localhost:8000` / `ws://localhost:8000`. No guardes claves reales en archivos versionados.

### Ejecución

Inicia el backend desde `dino-pad`:

```powershell
python -m backend.main
```

En otra terminal, inicia la interfaz:

```powershell
cd frontend
npm ci
npm run dev
```

Abre la URL que indique Vite (por defecto `http://localhost:5173`). Para validar o servir la compilación de producción:

```powershell
npm run lint
npm run build
npm run preview
```

### Ejemplo sencillo

Para ver el panel sin configurar backend, entra en `frontend`, ejecuta `npm ci` y `npm run dev`. Si la API no responde, la interfaz cambia al simulador local y muestra lecturas sintéticas. Para recibir telemetría por el backend, además inicia un broker MQTT y publica mensajes con el formato descrito abajo; el simulador del backend se ejecuta con `python -m backend.simulator.simulator`.

## 3. Estructura del proyecto

```text
dino-pad/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── models.py
│   ├── db.py
│   ├── mqtt_client.py
│   ├── rules.py
│   ├── gemini_service.py
│   ├── assistant_service.py
│   ├── backboard_service.py
│   ├── prompts/assistant_system_prompt.txt
│   ├── websocket_manager.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── data/crew.json
│   ├── simulator/
│   └── tests/test_assistant.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── components/AssistantPanel.jsx, Term.jsx, VisualRenderer.jsx
│   │   ├── data/crewData.js, glossary.js
│   │   ├── hooks/DataContext.jsx, useAssistant.jsx
│   │   ├── services/assistant.js
│   │   └── styles/
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
├── firmware/
│   ├── ble_scan/
│   ├── ble_send/
│   ├── dinopad/
│   ├── test_geometria/
│   ├── test_madctl/
│   ├── test_rotacion/
│   └── README.md
├── Hardware/
│   ├── src/escaner_i2c.cpp
│   ├── Firmware/tests/
│   ├── Hardware/datasheets/
│   └── platformio.ini
├── documentos_dino_pad/
├── LICENSE
└── README.md
```

- `backend/`: API FastAPI, configuración, validación de mensajes, reglas de alertas, persistencia, conexión MQTT y WebSockets. `simulator/` contiene el simulador MQTT y un broker mínimo usado por pruebas; `tests/` contiene pruebas por fases.
- `frontend/`: aplicación React servida/desarrollada con Vite. `components/` implementa pantallas y visor corporal 3D; `hooks/` comparte el estado; `services/` maneja API, reglas, caché/simulación y voz; `data/` contiene datos locales de respaldo; `public/` contiene los recursos estáticos y la configuración PWA.
- `firmware/`: sketches Arduino para ESP32. `dinopad/` implementa pantalla, botones y comunicación MQTT; `ble_scan/` y `ble_send/` son sketches BLE relacionados con Meshtastic/T1000-E. Los tests de pantalla son sketches de diagnóstico. El funcionamiento y la instalación se detallan en su README.
- `Hardware/`: configuración PlatformIO, escáner I²C y pruebas independientes de sensores/pantalla; `Hardware/Hardware/datasheets/` contiene documentación de módulos y pinouts.
- `documentos_dino_pad/`: recursos de documentación del prototipo.
- `LICENSE`: licencia del proyecto. `backend/.env.example` y `frontend/.env.example` son plantillas de configuración; las claves y contraseñas deben mantenerse fuera del control de versiones.

## 4. Estructuras de datos y componentes clave

### Backend y datos

- `backend/data/crew.json` organiza `crew`, `indicators`, `scenarios`, `hazards` y `zones`. Los indicadores definen unidad, rangos `ok`/`warn`, cadencia y acciones; los perfiles contienen baseline, sesgos y posibles rangos individuales. El frontend mantiene una copia equivalente en `frontend/src/data/crewData.js` para funcionar sin API; conviene conservar ambas alineadas.
- `VitalReading` valida lecturas con `crewId`, `indicatorId`, `value`, `unit`, `timestamp` (epoch en milisegundos), `source` y `quality`. `AlertMessage` valida `sos`/`ping`; `DeviceStatus` contiene identificador, tripulante, estado, batería, RSSI y timestamp. `StoredAlert` representa una alerta con nivel, mensaje, acción y explicación opcional de IA.
- Los temas MQTT esperados son `dinopad/vitals`, `dinopad/alertas` y `dinopad/estado`. Sus mensajes deben ajustarse a los modelos anteriores. `rules.py` aplica rangos y un anti-spam de 30 segundos. `gemini_service.py` solicita, opcionalmente, una explicación para alertas críticas o de atención.
- `db.py` crea `vitals`, `alerts` y `device_status`; intenta convertir `vitals` en hipertabla de TimescaleDB. Mantiene además copias en memoria para el modo degradado. Las rutas REST exponen salud, tripulación, últimas lecturas, historial y alertas; `/ws/vitals` y `/ws/alerts` distribuyen actualizaciones.
- **TODO:** `firmware/dinopad/` publica actualmente payloads/topics de demostración (`dinopad/sensores` y formatos de estado/alerta distintos a los modelos del backend). Alinear esos mensajes antes de considerar integrado ese sketch con la API.
- **TODO:** el backend guarda estado de dispositivo, pero no define una ruta REST para consultarlo; la interfaz tampoco lo consume.

### Frontend

- `DataProvider` en `hooks/DataContext.jsx` centraliza tripulación, lecturas, historial, alertas, conexión y preferencias. Comprueba el backend, conecta WebSockets cuando está disponible y activa `services/simulator.js` si no puede conectarse. Guarda una caché acotada en `localStorage`.
- `App.jsx` define navegación por hash y estado general de la aplicación. `components/Pages.jsx` implementa monitoreo, alertas, historial, tendencias, tripulación, riesgos, emergencia y laboratorio; `VitalMetrics.jsx` y `BodyViewer3D.jsx` forman parte de la vista de monitoreo.
- `services/health.js` interpreta rangos, tendencias y alertas en el navegador. `services/api.js` consume los endpoints REST y determina la dirección de WebSocket.

### Asistente educativo contextual

- Los términos con explicación se muestran en las pantallas mediante `components/Term.jsx`. Sus definiciones locales y los diagramas de respaldo están en `data/glossary.js`; el botón flotante o el atajo `Alt+Shift+A` abre el panel.
- `hooks/useAssistant.jsx` reúne página, tripulante activo, lecturas visibles, estado, alertas y término seleccionado. Mantiene hasta 24 mensajes y 30 conceptos por tripulante en `localStorage`. El rango normal mostrado por los términos se obtiene de `crewData.js` mediante `services/health.js`.
- Cuando el backend está disponible, `services/assistant.js` envía la consulta a `POST /api/assistant`. Gemini se configura solo en el backend con `GEMINI_APIKEY` y `GEMINI_MODEL`; el prompt editable y las reglas de seguridad están en `backend/prompts/assistant_system_prompt.txt`. Los visuales se validan y dibujan con componentes propios, sin ejecutar HTML generado.
- Backboard es opcional: configura `BACKBOARD_API_KEY` en el `.env` del backend para guardar conceptos educativos por tripulante. Si no está configurado o falla, el glosario y la memoria local siguen disponibles. No se envían lecturas numéricas a Backboard. Las preguntas y el contexto de pantalla sí se envían al backend/Gemini cuando se usa la IA.
- En modo sin conexión, los términos conservan definiciones locales y el asistente ofrece una respuesta de respaldo. Las respuestas no usan streaming; Gemini devuelve el resultado completo.

Para probar el endpoint, configura `GEMINI_APIKEY` en el `.env` del backend, inicia el backend y el frontend como se describe arriba, y pulsa un término subrayado. Para probar el modo local, inicia el frontend sin el backend. Las pruebas relacionadas con el asistente se ejecutan desde `dino-pad`:

```powershell
python -m unittest backend.tests.test_assistant
```

La validación de la interfaz se ejecuta desde `frontend`:

```powershell
npm run lint
npm run build
```

### Firmware

- `firmware/ble_send/` incluye decodificación Nanopb y visualización de datos recibidos por BLE; `ble_scan/` explora nodos BLE. `firmware/dinopad/` usa una pantalla ILI9341 y botones físicos con Wi-Fi/MQTT.
- `Hardware/Firmware/tests/` contiene pruebas específicas de pantalla, I²C y sensores. Son sketches de prueba independientes; no se documenta aquí una integración entre estos y la API.
