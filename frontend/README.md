# Dinopad · Centro de control

Interfaz web para el prototipo de monitoreo de salud de tripulación espacial. Las lecturas que genera el simulador son sintéticas y no deben utilizarse para decisiones médicas.

## Desarrollo local

```powershell
cd frontend
npm install
npm run dev
```

Opcionalmente, copia `.env.example` a `.env.local` y configura:

- `VITE_API_URL`: dirección HTTP del backend (por defecto `http://localhost:8000`).
- `VITE_WS_URL`: dirección WebSocket del backend (por defecto `ws://localhost:8000`).

## PWA y prueba sin conexión

Ejecuta `npm run build` y `npm run preview`, abre la URL local del preview al menos una vez y luego activa el modo sin conexión del navegador y recarga. La aplicación conserva su shell y sus recursos estáticos; los datos permanecen sujetos a la caché local existente. El botón de instalación requiere `localhost` o HTTPS.

La app consulta `/health` y `/api/crew`, `/api/vitals/latest`, `/api/vitals/history` y `/api/alerts`. Si el backend no responde a la API, inicia el simulador local; la caché acotada permanece en el navegador y puede demostrarse desde Laboratorio. Los WebSockets se reconectan automáticamente.

## Secciones

Monitoreo, Alertas, Historial, Tendencias, Tripulación, Riesgos NASA, Emergencia y Laboratorio. El visor corporal holográfico se carga bajo demanda y puede rotarse con el mouse.

Los rangos y perfiles usan los datos del proyecto. Las lecturas del modo local se identifican como simuladas. El prototipo no hace diagnósticos; el contenido de Riesgos NASA está marcado para validación con fuentes oficiales. El estado de batería y RSSI queda pendiente de un endpoint de dispositivo: el backend actual no lo expone a la interfaz.

## Verificación

```powershell
npm run build
npm run lint
```
