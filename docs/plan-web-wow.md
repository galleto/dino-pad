# Plan de rediseño `web-wow` (por etapas)

Cada etapa termina con: `npm run build` y `npm run lint` sin errores; capturas
(escritorio 1920×1080 y celular 390×844) con Firefox sin interfaz; prueba sin
backend (simulador local) y con el backend simulado; casillas de
`inventario-funciones.md` revisadas; `cumplimiento-reto.md` actualizado; **un
commit**. Se puede parar después de cualquier etapa y la web sigue completa.

No se tocan: contrato, `backend/`, `firmware/`, hooks, servicios, `crewData.js`,
`sw.js`. Todo lo nuevo son componentes de presentación y CSS.

Origen de dato en toda la UI con un solo componente `<Origen>`:
**REAL** (`source: "live"` o hardware), **DEMO** (simulado por nosotros, incluido el
simulador local) y **REFERENCIA NASA** (solo lo de la tabla "leída" de
`cumplimiento-reto.md`). Los rangos del equipo se rotulan "rango del proyecto".

| Etapa | Qué | Impacto visual | Requisitos del reto que cierra |
|---|---|---|---|
| **1. Sistema de diseño** | Paleta (fondo espacio profundo, vidrio, glow sutil), tipografía propia empaquetada en el build (sin internet), tokens, fondo animado ligero (campo estelar en canvas, pausado con `prefers-reduced-motion`), transiciones, componente `<Origen>`. Reestiliza la shell y las 8 páginas sin quitar nada | Muy alto | (base de todo) |
| **2. Figura humana SVG** | Figura propia en SVG con zonas (cerebro, corazón, pulmones, abdomen/metabolismo, piel/temperatura, huesos y músculo) que brillan verde/ámbar/rojo; latido sincronizado al BPM. Panel de zona: función, valor con gráfica, rango, cómo se mide (`how`), por qué importa en el espacio (`why` + peligro HRP), qué hacer (`action`) y **cuándo avisar** (atención → tripulación; crítico → flight surgeon). El visor 3D se conserva como "Vista 3D" opcional | Muy alto | 2, 3a–d, 4, 9 |
| **3. DINO PAD EN VIVO** | Réplica 320×240 en canvas con escalado nítido y brillo de fósforo, 5 pestañas con los colores y textos de `ui.cpp`; 3 botones clicables y teclado con la lógica de `botones.cpp` (portada a JS con prueba); SOS de PRUEBA con barra (el SOS real sigue solo por el flujo existente); DEMO AUTO; insignia "EN VIVO desde el DINO PAD / hace Xs" solo con mensajes `live` recientes, si no "SIMULADO"; cadena animada ESP32 → BLE → T1000-E → LoRa → base → web y Wi-Fi/MQTT con estado por eslabón; vínculo con la figura humana. `docs/propuesta-espejo.md` | Muy alto | 1b, propios |
| **4. Fuentes y ciencia + 5 peligros** | Sección con los 8 enlaces (qué es cada uno y a qué se vincula); rueda de los 5 peligros HRP con sus indicadores y efecto; botón "¿Por qué importa?" en cada indicador; aviso de que no todos los datos NASA son vitales continuos (Standard Measures) | Alto | 3c, 11, 12 |
| **5. Gráficas vivas + gamificación + registro** | Trazo tipo ECG (DEMO), líneas suaves con degradado, sparklines; anillo de "preparación de misión", rachas, insignias y recordatorios por cadencia; registro manual (ánimo, sueño, glucosa) **solo local**, rotulado "registro del usuario" (enviarlo al backend sería PROPUESTA) | Alto | 5a, 5b, 7, 8 |
| **6. Entorno + reloj de misión** | Selector nave / estación / rover / base lunar / base marciana que ajusta textos y peligros destacados; reloj Tierra + sol marciano (24 h 39 min 35 s) y retraso Tierra–Marte animado (rango calculado con la velocidad de la luz; cifras "a confirmar" si no hay fuente leída) | Medio | 10 |
| **7. Modo tormenta solar** | Con una alerta de radiación o con un botón de demo (usa el escenario "Tormenta solar" que ya existe): la interfaz cambia, cuenta regresiva y protocolo de refugio paso a paso (genérico, "referencia a confirmar") | Medio | 2, 11 |
| **8. Mapa de Jezero** | Base y tripulantes con las coordenadas DEMO de `posicion_demo.h` (18.44 N, 77.45 E, NASA GISS) y radar; posición real solo si llega | Medio | propios |
| **9. Intro y modo presentación** | Intro de ~5 s omitible (y nunca con movimiento reducido) y recorrido automático por todas las vistas | Medio | — |

## Decisiones tomadas (15/11/2026)

1. La figura SVG será la vista principal; el 3D queda como "Vista 3D" opcional con import
   dinámico. `vite.config.js` sube el límite a 1000 kB solo por el bloque `BodyViewer3D`
   (hecho en E1, con un plugin que sigue avisando por cualquier otro bloque > 500 kB).
2. Fuentes `@fontsource/chakra-petch` y `@fontsource/jetbrains-mono` (5.3.0, OFL) dentro
   del build. Verificar sin red; si `sw.js` necesitara cambios, se proponen antes.
3. Registro manual solo en el navegador, rotulado "REGISTRO DEL USUARIO", como origen
   distinto de REAL, DEMO y REFERENCIA NASA, explicado en la UI. No viaja al backend.
4. Capturas con Firefox sin interfaz. Playwright solo en la etapa del DINO PAD y fuera de
   `frontend/`.
5. Orden: etapas 1, 2, 3 y luego 7 (tormenta solar); el resto después.
6. Las imágenes sin uso se conservan (anotadas en el inventario).
7. OSDR, NLSP y los 2 artículos de la CSA: "referencia a confirmar", sin citar contenido.

Una etapa a la vez: build y lint, capturas, inventario y matriz, commit, y esperar OK.
