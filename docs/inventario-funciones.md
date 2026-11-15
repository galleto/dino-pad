# Inventario de funciones de la web (frontend/)

Estado leído de `origin/main` (`14731e8`, 14/11/2026), rama `web-wow`.
**Regla: no se quita nada.** Rediseñar es reubicar o re-presentar. Si algo
parece sobrar, se pregunta antes. Cada casilla se marca `[x]` cuando se comprueba
que sigue funcionando después de una etapa del rediseño (columna "Verificado en").

Archivos que **no se modifican** (lógica del equipo): `hooks/DataContext.jsx`,
`hooks/DataContext.js`, `hooks/useAlerts.js`, `hooks/useConnection.js`,
`hooks/useVitals.js`, `services/api.js`, `services/readings.js`,
`services/health.js`, `services/simulator.js`, `services/speech.js`,
`data/crewData.js`, `public/sw.js`, `main.jsx` (registro del service worker).

## 1. Estructura general (App.jsx)

| | Elemento | Dónde | Verificado en |
|---|---|---|---|
| [x] | Navegación por hash `#/ruta`, ruta por defecto `monitoreo` | App.jsx `getRoute` | E1 |
| [x] | Barra lateral con marca "DINOPAD · SISTEMA DE SALUD ESPACIAL" (enlace a Monitoreo) | App.jsx | E1 |
| [x] | 8 secciones numeradas: 01 Monitoreo, 02 Alertas, 03 Historial, 04 Tendencias, 05 Tripulación, 06 Riesgos NASA, 07 Emergencia, 08 Laboratorio | App.jsx `NAV_ITEMS` | E1 |
| [x] | Enlace activo resaltado y `aria-current="page"` | App.jsx | E1 |
| [x] | Pie de barra lateral "SISTEMA OPERATIVO · CONTROL DE MISIÓN · 2026" | App.jsx | E1 |
| [x] | Barra superior: ruta (eyebrow) + título de la página | App.jsx | E1 |
| [x] | Píldora de conexión: EN VIVO / SIMULADOR LOCAL / SIN ENLACE / CONECTANDO (con color) | App.jsx + `connectionState` | E1 |
| [x] | Selector de tripulante activo en la barra superior (avatar con inicial + `<select>`) | App.jsx | E1: visible (interacción no probada) |
| [x] | Banner **ALERTA SOS RECIBIDA** con baliza, mensaje y botón "Reconocer SOS" | App.jsx (detecta `/sos/i` en título/acción) | E1: probado con backend simulado |
| [x] | Aviso "● Sincronizado con el backend" (3.5 s al reconectar) | App.jsx + `synchronized` | E1: probado con backend simulado |
| [ ] | Aviso de error de caché local (`cacheWarning`) | App.jsx | pendiente (no se forzó el error) |
| [ ] | Banner "SIN ENLACE · Datos en caché guardados …" en modo offline | App.jsx | pendiente (se prueba con Laboratorio en E3) |
| [ ] | Página genérica `EmptyPage` para rutas sin contenido | Pages.jsx | pendiente (ninguna ruta la usa hoy) |
| [x] | Pie: "DINOPAD · NASA SPACE APPS 2026" y "Prototipo de monitoreo · No es un dispositivo médico" | App.jsx | E1 |
| [x] | Efecto de líneas de barrido (`scanlines`), desactivado con `prefers-reduced-motion` | components.css | E1 |
| [x] | Responsivo: barra lateral compacta (≤1100 px) y barra inferior de navegación (≤720 px) | layout.css | E1 |

## 2. PWA y modo sin conexión

| | Elemento | Dónde | Verificado en |
|---|---|---|---|
| [x] | Manifest (nombre, íconos 192/512, maskable, `start_url #/monitoreo`, standalone) | public/manifest.webmanifest | E1 |
| [ ] | Service worker en producción: precarga de la shell y recursos del build (`.vite/manifest.json`) | public/sw.js, main.jsx | pendiente: prueba sin conexión real en E3 (Playwright) |
| [ ] | En desarrollo se desregistra el SW local y se borran cachés `dinopad-shell-*` | main.jsx | pendiente (modo dev) |
| [ ] | Aviso "Nueva versión disponible, recargar" | App.jsx | pendiente (requiere SW instalado) |
| [ ] | Botón "Instalable · Instalar" (beforeinstallprompt) y detección de app instalada | App.jsx | pendiente (requiere SW instalado) |
| [ ] | Aviso "PWA no disponible" si falla | App.jsx | pendiente |
| [x] | Caché local de lecturas, historial (140) y alertas (100) en `localStorage` | DataContext.jsx | E1 |
| [x] | Tripulante activo, voz y SOS reconocido persisten en `localStorage` | DataContext.jsx | E1 |

## 3. Datos y conexión (lógica, se usa tal cual)

| | Elemento | Dónde | Verificado en |
|---|---|---|---|
| [x] | Sondeo de `/health` cada 5 s; al reconectar carga `/api/crew`, `/api/vitals/latest`, `/api/alerts` | DataContext.jsx, api.js | E1: probado con backend simulado |
| [x] | WebSockets `/ws/vitals` y `/ws/alerts` con reconexión cada 5 s | DataContext.jsx | E1: probado con backend simulado |
| [x] | Simulador local si no hay backend (lecturas `source: "simulated"`, cadencia por indicador, 1 % sin señal) | simulator.js | E1 |
| [x] | 5 escenarios del simulador: Día normal, EVA exigente, Tormenta solar, Semana de aislamiento, Falla de soporte vital | crewData.js `SCENARIOS` | E1 |
| [x] | Detección de navegador sin red (`online`/`offline`) | DataContext.jsx | E1 |
| [x] | Alertas derivadas en el navegador (fuera de rango / sin señal) además de las del backend, ordenadas por prioridad | health.js `buildAlerts`, DataContext.jsx | E1: probado con backend simulado |
| [x] | Estado por indicador: Normal / Atención / Crítico / Sin señal (semáforo), con rangos propios por tripulante | health.js | E1 |
| [x] | Etiqueta de origen por lectura (re-presentada en E1 como REAL / DEMO / ORIGEN NO INDICADO con `Origen.jsx`; readings.js sin cambios) | readings.js, components/origenes.js | E1 |
| [ ] | Lectura en voz alta de alertas críticas (Web Speech, español) | speech.js, DataContext.jsx | pendiente (sin audio en la prueba) |

## 4. 01 Monitoreo (VitalMetrics.jsx)

| | Elemento | Dónde | Verificado en |
|---|---|---|---|
| [x] | Selector de tripulación con botones (inicial, nombre, rol) | CrewSelector.jsx | E1: visible (interacción no probada) |
| [x] | Estado general del tripulante (Normal / Atención / Crítico) | VitalMetrics.jsx | E1 |
| [x] | 7 tarjetas de indicador: hr, spo2, temp, bp, glu, sleep, mood | VitalCard.jsx | E1 |
| [x] | Cada tarjeta: nombre, estado con color, valor + unidad, rango normal, minigráfica (18 lecturas), etiqueta de origen, "SIN SEÑAL" | VitalCard.jsx | E1 |
| [x] | Tarjeta seleccionable (resaltado) | VitalCard.jsx | E1: visible (interacción no probada) |
| [ ] | Visor corporal 3D (three.js, carga diferida): esqueleto en alambre, rotación con el mouse, cuadrícula | BodyViewer3D.jsx | pendiente: Firefox sin interfaz no tiene WebGL |
| [ ] | 7 puntos biométricos clicables con color de estado (Corazón, Presión, Pulmones, Muñeca, Abdomen, Sueño, Ánimo) | BodyViewer3D.jsx | pendiente (depende del visor 3D) |
| [x] | Leyenda de puntos con botones; seleccionar punto ↔ tarjeta | BodyViewer3D.jsx, VitalMetrics.jsx | E1: visible (interacción no probada) |
| [ ] | Respaldos si no hay WebGL o se pierde el contexto | BodyViewer3D.jsx | pendiente |
| [x] | Panel "Alertas activas" (4 primeras, compacto) con contador | VitalMetrics.jsx | E1: probado con backend simulado |
| [x] | Panel "Últimos eventos" (5 indicadores: hora, origen, valor) | VitalMetrics.jsx | E1 |

## 5. 02 Alertas

| | Elemento | Dónde | Verificado en |
|---|---|---|---|
| [x] | Filtro por nivel (todas / críticas / atención / informativas) | Pages.jsx `AlertsPage` | E1: visible (interacción no probada) |
| [x] | Filtro por tripulante (o toda la tripulación) | Pages.jsx | E1: visible (interacción no probada) |
| [x] | Interruptor "Leer alertas críticas en voz alta" (si el navegador lo soporta) | Pages.jsx | E1: visible (interacción no probada) |
| [x] | Tarjeta de alerta: nivel, hora, título, mensaje, botón "Escuchar alerta" | HealthAlerts.jsx | E1: probado con backend simulado |
| [x] | "¿Por qué se generó?" (valor contra rango) y origen de la lectura | HealthAlerts.jsx | E1: probado con backend simulado |
| [x] | "Acción recomendada" | HealthAlerts.jsx | E1: probado con backend simulado |
| [x] | "Explicación informativa" (IA del backend, `aiExplanation`; "Analizando…"; aviso de no diagnóstico) | HealthAlerts.jsx | E1: probado con backend simulado |
| [x] | Contador de registros | Pages.jsx | E1: probado con backend simulado |

## 6. 03 Historial

| | Elemento | Dónde | Verificado en |
|---|---|---|---|
| [x] | Selectores de tripulante, indicador y cantidad (30–500 lecturas) | Pages.jsx `HistoryPage` | E1: visible (interacción no probada) |
| [ ] | Historial remoto `/api/vitals/history` en vivo; caché local si falla (con aviso) | Pages.jsx | pendiente (no se capturó Historial con backend) |
| [x] | Gráfica SVG: banda de rango normal, línea base personal, puntos con tooltip y foco por teclado | Pages.jsx `HistoryChart` | E1 |
| [x] | Leyenda y resumen (última lectura, origen, actualizado) | Pages.jsx | E1 |

## 7. 04 Tendencias

| | Elemento | Dónde | Verificado en |
|---|---|---|---|
| [x] | Selector de indicador | Pages.jsx `TrendsPage` | E1: visible (interacción no probada) |
| [x] | Tarjeta por tripulante: dirección (subiendo/bajando/estable), valor, regresión lineal, base personal, confianza con barra, n.º de lecturas | Pages.jsx | E1 |
| [x] | "Relaciones observadas" (r de Pearson por cercanía temporal, "no implica causalidad") | Pages.jsx | E1 |

## 8. 05 Tripulación

| | Elemento | Dónde | Verificado en |
|---|---|---|---|
| [x] | Perfil por tripulante: inicial, nombre, rol, misión, botón "Ver en monitoreo"/"ACTIVO" | Pages.jsx `CrewPage` | E1 |
| [x] | Línea base individual y rango de los 7 indicadores | Pages.jsx | E1 |
| [x] | Riesgos enfocados (peligros HRP de sus indicadores foco), color de acento e ID | Pages.jsx + `HAZARDS` | E1 |

## 9. 06 Riesgos NASA

| | Elemento | Dónde | Verificado en |
|---|---|---|---|
| [x] | Banner "CONTENIDO A VALIDAR CON FUENTES OFICIALES" | Pages.jsx `RisksPage` | E1 |
| [x] | Tabla riesgo → qué se monitorea → indicadores (6 filas) | Pages.jsx `NASA_RISKS` | E1 |
| [x] | Textos: entorno espacial, "Más que una lectura aislada", limitaciones del prototipo | Pages.jsx | E1 |
| [x] | "Fuentes de referencia por validar: NASA HRP · Agencia Espacial Canadiense" (sin enlaces) | Pages.jsx | E1 |

## 10. 07 Emergencia

| | Elemento | Dónde | Verificado en |
|---|---|---|---|
| [x] | Estado del SOS (activo / sin SOS) con botón "Reconocer SOS" | Pages.jsx `EmergencyPage` | E1: probado con backend simulado |
| [x] | Historial de SOS (reconocido / pendiente, hora) | Pages.jsx | E1: probado con backend simulado |
| [x] | "Estado del wearable": batería y RSSI ("Sin datos"; nota de que el backend no lo expone) | Pages.jsx | E1 |

## 11. 08 Laboratorio

| | Elemento | Dónde | Verificado en |
|---|---|---|---|
| [ ] | Activar escenario del simulador (5 botones) con aviso "NO ES TELEMETRÍA REAL" | Pages.jsx `LabPage` | visible E1; interacción pendiente |
| [ ] | Prueba de pérdida de enlace (forzar offline / restablecer) y vista de caché | Pages.jsx | visible E1; interacción pendiente |
| [x] | Instrucciones para probar la PWA | Pages.jsx | E1 |
| [x] | Métricas: origen de lecturas recientes; latencia lectura → alerta | Pages.jsx | E1 |
| [x] | "Límites de validación: falsos positivos y negativos" | Pages.jsx | E1 |

## 12. Datos y textos que existen pero **no se muestran** hoy

No se quitan; el rediseño los hace visibles.

| | Elemento | Dónde |
|---|---|---|
| [ ] | `what` / `why` / `how` de cada indicador (qué es, por qué cambia en el espacio, cómo se mide) | crewData.js `INDICATORS` |
| [ ] | `hazards` de cada indicador (solo se usan indirectamente en Tripulación) | crewData.js |
| [ ] | `ZONES` (cabeza, corazón, pulmones, abdomen, cuerpo) | crewData.js |
| [ ] | `scenario` activo fuera de Laboratorio | DataContext.jsx |
| [x] | Recursos sin uso en la UI: `src/assets/hero.png`, `react.svg`, `vite.svg`, `public/icons.svg`, `public/favicon.svg` (el favicon real es `icons/icon.svg`). Se conservan; preguntar antes de borrar | E1 |

## 13. Agregado en web-wow

| | Elemento | Etapa | Verificado en |
|---|---|---|---|
| [x] | Fuentes Chakra Petch y JetBrains Mono dentro del build (`@fontsource`, OFL); las 14 están en la lista de precarga de `sw.js` (no hizo falta cambiar `sw.js`) | E1 | E1 (lista de precarga); prueba sin red real pendiente para E3 |
| [x] | Fondo de campo estelar (canvas) y cuadrícula orbital; fijo con `prefers-reduced-motion`, en pausa con la pestaña oculta | E1 | E1 |
| [x] | Transición al cambiar de página | E1 | E1 |
| [x] | Componente `Origen` (REAL / DEMO / REFERENCIA NASA / REGISTRO DEL USUARIO) y leyenda plegable en Monitoreo y Laboratorio | E1 | E1 |
| [x] | `vite.config.js`: límite de 1000 kB solo para el bloque `BodyViewer3D`; el plugin avisa si otro bloque pasa de 500 kB | E1 | E1 (build sin advertencias; plugin probado con límite de 100 kB) |

### Pieza A (base visual nueva, 15/11/2026)

| | Elemento | Verificado en |
|---|---|---|
| [x] | Paleta y tipografía originales (fósforo verde); barra lateral → barra de título + pestañas; pie con "SISTEMA OPERATIVO" | A: capturas 1920 y 390 |
| [x] | Las 7 tarjetas pasan a "canales" (mismo contenido + escala con aguja) | A: capturas |
| [x] | Figura humana SVG con 7 zonas como vista principal; el visor 3D queda tras el botón "Vista 3D" | A: figura en capturas; 3D e interacción sin probar |
| [x] | Leyenda de orígenes: clave compacta en la barra de título (popover) y lista en Laboratorio | A: visible; popover sin probar |
| [x] | `what` del indicador seleccionado bajo la figura | A: código; sin probar el clic |

### Pieza B (figura y dossier)

| | Elemento | Verificado en |
|---|---|---|
| [x] | Figura con 11 zonas clicables y con teclado; selección figura ↔ canal | B: Playwright |
| [x] | Dossier por zona: `what`, `why`, `how`, `action`, `hazards` de crewData.js ya visibles (sección 12) | B: Playwright |
| [x] | Botón "¿Por qué importa?" en cada indicador | B: Playwright |
| [x] | Latido del corazón al ritmo de la FC, con el origen de la lectura | B: Playwright (`--latido`) |
| [ ] | Vista 3D con WebGL real | pendiente (sin WebGL en la prueba; se ve el respaldo) |

### Pieza C (DINO PAD EN VIVO)

| | Elemento | Verificado en |
|---|---|---|
| [x] | Página 09 "DINO PAD": gemelo 320×240 con las 5 pestañas del firmware | C: Playwright y capturas |
| [x] | Botones NEGRO / BLANCO / ROJO (clic, toque, teclado), ROJO largo = volver | C: Playwright |
| [x] | SOS de PRUEBA (NEGRO+BLANCO 3 s, barra de progreso); no dispara el SOS real | C: Playwright |
| [x] | DEMO AUTO con el guion del firmware y rótulo amarillo | C: Playwright |
| [x] | Cadena "¿Cómo se crean los datos?" con estado y origen por eslabón | C: capturas |
| [x] | Vínculo DINO PAD ↔ figura humana | C: Playwright |
| [ ] | Insignia "EN VIVO desde el DINO PAD" con lecturas reales | pendiente (sin backend con `live`) |

## 14. Estado de partida del build

- `npm run build`: compila, con **1 advertencia**: el chunk de `BodyViewer3D`
  (three.js) pesa 943 KB, más que el límite de 500 KB de Vite.
- `npm run lint`: sin errores ni advertencias.
