# Cumplimiento del reto: "Create Health Monitoring Software for Astronauts on Space Missions"

Estado de **partida** (antes del rediseño), leído en el código de `origin/main`
(`14731e8`) el 15/11/2026. Estados: **cumple** (verificado en el código),
**parcial** (existe pero incompleto o escondido), **falta** (no existe).
Se actualiza al cerrar cada etapa (columna "Después").

**Tras la Etapa 1 (sistema de diseño):** ningún requisito del reto cambia de estado.
La etapa es visual (paleta, tipografía, vidrio, fondo, rótulos de origen); el semáforo
(6) y las gráficas (7) siguen cumpliendo con el nuevo estilo.

**Tras la pieza A (base visual, 15/11/2026):** ningún requisito cambia a "cumple". El 9
(figura humana) sigue **parcial**: ya hay figura SVG con zonas que toman el color del
semáforo, pero falta el dossier con la función de cada zona (pieza B).

**Tras C y D:** D refuerza el requisito 2 (acciones para prevenir una condición crítica) con
el protocolo de refugio paso a paso; es un ejemplo del proyecto, rotulado "referencia a
confirmar".

## MATRIZ FINAL (tras las piezas A a I, 15/11/2026)

"Cumple" = existe y se comprobó con Playwright (clics, teclado, consola sin errores) sobre la
build de producción con el simulador local. Lo que no se pudo comprobar se dice.

| # | Requisito | Estado | Dónde | Comprobado |
|---|---|---|---|---|
| 1 | Reúne los 7 indicadores | **cumple** | Monitoreo (canales), Historial, Tendencias | sí |
| 1b | El astronauta puede evaluarlos | **cumple** | Semáforo con glifo en cada canal y zona; dossier "Cuándo avisar"; Bitácora evalúa lo que anota contra el rango | sí |
| 2 | Guía de tratamiento y prevención | **cumple** | Dossier "Qué hacer si sale mal"; consejo en Bitácora; protocolo de refugio (ejemplo del proyecto) | sí |
| 3a | Qué se puede medir en el espacio | **cumple** | Dossier "Qué se mide y cómo"; DINO PAD dice qué mide de verdad el hardware | sí |
| 3b | Por qué se necesita cada examen | **cumple** | Dossier y pie de la figura | sí |
| 3c | Cómo afectan los peligros a cada indicador | **cumple** | Dossier "¿Por qué importa?"; rueda de peligros | sí |
| 3d | Cuándo avisar a tripulación o a tierra | **cumple** | Dossier "Cuándo avisar" + retraso de la señal según el entorno (regla del proyecto) | sí |
| 4 | Instrucciones simples | **cumple** | Un toque en la zona o en "¿Por qué importa?" | sí |
| 5a | Entrada de datos del usuario | **cumple** (teclado y clics) | Bitácora: ánimo, sueño, glucosa. Sin cámara | sí |
| 5b | Recordatorios periódicos | **cumple** | Bitácora (lista) y aviso con número en la pestaña. Sin notificaciones del sistema | sí |
| 6 | Semáforo de colores | **cumple** | Toda la interfaz, siempre con glifo además del color | sí |
| 7 | Gráficas dinámicas | **cumple** | Minigráficas suaves, dossier, Historial, Bitácora, trazo tipo ECG (DEMO), pantalla VITAL | sí |
| 8 | Gamificación | **cumple** | Anillo de preparación, racha, semana, 5 insignias | sí |
| 9 | Figura humana con zonas clicables | **cumple** | Figura 3D (y 2D alternativa) con 11 zonas, función y estado | sí |
| 10 | Distintos entornos | **cumple** | Selector (nave, estación, rover, base lunar, base marciana): cambia retraso, gravedad, peligros destacados y mensajes | sí |
| 11 | Los 5 peligros del HRP | **cumple** | Rueda en Riesgos NASA, ligada a indicadores | sí |
| 12 | Recursos NASA/CSA visibles | **parcial** | "Fuentes y ciencia": los 8 enlaces; 4 leídos y citados, 4 marcados "referencia a confirmar" sin citar contenido | sí |

Ningún requisito queda en "falta". El 12 queda parcial a propósito: no se cita lo que no se leyó.

### Requisitos propios

| Requisito | Estado final |
|---|---|
| 4 orígenes visibles (REAL / DEMO / REFERENCIA NASA / REGISTRO DEL USUARIO) | **cumple**: los cuatro tienen datos que los usan |
| DINO PAD EN VIVO | **cumple como gemelo simulado**; espejo exacto = PROPUESTA |
| Batería, temperatura ambiente y luz del T1000-E | **parcial**: en el gemelo, como DEMO; reales con la PROPUESTA 2 |
| Mapa de Jezero | **cumple** (DEMO) |
| Reloj de misión y retraso | **cumple** (cálculo estimado, referencias a confirmar) |
| Modo tormenta, intro, modo presentación, sonido opcional | **cumple** |
| Funciona sin internet | **cumple**: probado con el service worker y la red cortada |

### Sin comprobar (decirlo en la demo si preguntan)
- Backend del equipo y dispositivo reales. La ruta `live` del frontend SÍ se probó, pero contra un backend
  de prueba que imita el contrato (`~/.cache/dinopad-pw/mock.mjs`, fuera del repo): píldora EN VIVO, rótulos
  REAL, insignia EN VIVO del DINO PAD, historial remoto, banner SOS y su reconocimiento, y modo tormenta por
  una alerta de radiación. Falta repetirlo con el backend y el hardware de verdad.
- Lectura en voz alta y sonidos (sin audio en la prueba). La figura 3D sí se probó con WebGL por software;
  falta verla en el equipo del escenario.
- Fidelidad de la fuente del gemelo contra el dispositivo; toque con dos dedos en celular real.
- 60 fps: no se midió; las animaciones son CSS/SVG/canvas ligeros y se pausan con movimiento reducido.
- Contraste AA: revisado por diseño (texto #d8e6d9 y #84958a sobre #080d0a), sin auditoría automática.

## Matriz de partida y avance por pieza

| # | Requisito del reto | Dónde se cumple hoy | Estado | Qué falta | Después |
|---|---|---|---|---|---|
| 1 | Reúne indicadores: presión arterial, frecuencia cardiaca, glucosa, temperatura corporal, sueño, ánimo, SpO2 | 7 tarjetas en Monitoreo (`hr`, `spo2`, `temp`, `bp`, `glu`, `sleep`, `mood`), historial y tendencias | **cumple** | — | |
| 1b | …y permite al astronauta **evaluarlos** | Semáforo y rango normal por tarjeta; estado general | **parcial** | La vista es de la base; no hay una vista o lenguaje pensado para el astronauta ("¿estoy bien?") | |
| 2 | Guía sobre tratamientos y mejoras; acciones para prevenir una condición crítica | `action` de cada indicador, solo dentro de una alerta | **parcial** | Mostrar la acción siempre (no solo cuando hay alerta) y una guía preventiva por indicador | **cumple** (B: "Qué hacer si sale mal" siempre visible en el dossier de cada indicador; probado con Playwright) |
| 3a | Qué mediciones se pueden hacer en el espacio | `how` existe en `crewData.js` pero **no se muestra** | **falta** (en UI) | Mostrar "cómo se mide" y qué medimos de verdad (MAX30102 previsto, T1000-E) | **cumple** (B: "Qué se mide y cómo" en el dossier). Falta decir qué mide de verdad el hardware (pieza C) |
| 3b | Por qué se necesita cada examen | `what` existe pero **no se muestra** | **falta** (en UI) | Panel por indicador | **cumple** (B: `what` en el dossier y bajo la figura) |
| 3c | Cómo los peligros del vuelo afectan cada indicador | `why` y `hazards` existen; solo se ven de forma indirecta en Tripulación | **parcial** | Vincular indicador ↔ peligro HRP con su efecto | **cumple** (B: "¿Por qué importa en el espacio?" con los peligros HRP del indicador y el riesgo HRP leído, rotulado REFERENCIA NASA) |
| 3d | Cuándo avisar a la tripulación o a los flight surgeons | Algunas `action` dicen "contacta al cirujano de vuelo" / "avisa a tierra" | **parcial** | Regla visible por indicador: cuándo avisar (atención → tripulación, crítico → tierra) | **cumple** (B: "Cuándo avisar" por indicador, resaltando el estado actual; es regla del proyecto) |
| 4 | No asumir que el astronauta sabe: instrucciones simples y explicaciones | Textos de alerta y de Riesgos | **parcial** | Explicaciones en lenguaje simple por indicador, accesibles con un toque | **cumple** (B: un toque en la zona o en "¿Por qué importa?" abre la explicación en lenguaje simple) |
| 5a | Entrada de datos del usuario (teclado, clics, cámara) | Solo selectores (tripulante, filtros, escenarios) | **falta** | Registro manual (p. ej. ánimo 1–10, sueño, glucosa) marcado como dato del usuario; cámara: evaluar | |
| 5b | Recordatorios periódicos de medición | — | **falta** | Recordatorios según la cadencia de cada indicador | |
| 6 | Color (semáforo) para interpretar de un vistazo | Tarjetas, puntos del visor, alertas, estado general | **cumple** | — | cumple (E1: barra de estado con brillo, verde/ámbar/rojo reservados al semáforo) |
| 7 | Gráficas dinámicas de la evolución en el tiempo | Minigráficas por tarjeta, Historial (SVG con banda), Tendencias | **cumple** | Mejorar lo visual (no es requisito) | cumple (E1: minigráficas a todo el ancho) |
| 8 | Gamificación que incentive tareas de salud | — | **falta** | Rachas, insignias, anillo de preparación de misión | |
| 9 | Figura humana con zonas clicables (función y estado de cada parte) | Visor 3D: 7 puntos clicables con color de estado; selección ↔ tarjeta | **parcial** | Zonas del cuerpo (no solo puntos) y panel con la **función** de la zona y su explicación | **cumple** (B: figura SVG con 11 zonas clicables y con teclado; 7 con semáforo, 4 de referencia "sin sensor"; dossier con función y estado) |
| 10 | Contexto de distintos entornos (nave, estación, rover, base lunar/marciana) | Escenarios del simulador (EVA, tormenta solar…) no son entornos | **falta** | Selector de entorno que ajuste contexto y mensajes | |
| 11 | Los 5 peligros del HRP vinculados a los indicadores y a su efecto | `HAZARDS` con los 5 nombres; `hazards` por indicador; página Riesgos usa otras categorías y dice "a validar" | **parcial** | Rueda/listado de los 5 peligros con sus indicadores, efecto y fuente | |
| 12 | Uso visible de los recursos NASA/CSA entregados | Riesgos dice "NASA Human Research Program · Agencia Espacial Canadiense", sin enlaces | **falta** | Sección "Fuentes y ciencia" con los 8 enlaces y "¿Por qué importa?" por indicador | |

### Requisitos propios del proyecto (no del reto, pedidos por el equipo)

| Requisito | Estado hoy |
|---|---|
| Tres orígenes visibles: REAL / DEMO / REFERENCIA NASA (+ REGISTRO DEL USUARIO) | Partida: **parcial** (EN VIVO / SIMULADO). **Tras E1: parcial**: rótulo `Origen` con los 4 orígenes y leyenda en Monitoreo y Laboratorio; todas las lecturas muestran REAL o DEMO. REFERENCIA NASA y REGISTRO DEL USUARIO están definidos pero aún no hay datos que los usen (E4 y E5) |
| DINO PAD EN VIVO (gemelo digital de la pantalla 320x240) | Partida: falta. **Tras C: cumple** como gemelo simulado (rotulado SIMULADO/DEMO); el espejo exacto es PROPUESTA (`docs/propuesta-espejo.md`) |
| Batería, temperatura ambiente y luz del T1000-E aparte de la temperatura corporal | Partida: falta. **Tras C: parcial**: se muestran en el gemelo (pestañas ESTADO y AMBIENTE) como DEMO y separadas de la temperatura corporal; datos reales requieren la PROPUESTA 2 |
| Mapa de Jezero con base y tripulantes (DEMO) | **falta** |
| Reloj de misión (Tierra + sol marciano, retraso de comunicación) | **falta** |

## Fuentes NASA/CSA: qué se pudo leer (15/11/2026)

Solo se citará en la UI lo que está en esta tabla como **leído**. Lo demás va
como "referencia a confirmar".

| Fuente | Leída | Qué dice (resumen fiel) | Se vincula con |
|---|---|---|---|
| [NASA HRP · Hazards](https://www.nasa.gov/hrp/hazards/) | **sí** | 5 peligros: *Space Radiation* ("one of the most hazardous aspects of spaceflight"), *Isolation and Confinement*, *Distance from Earth* ("Planning and self-sufficiency will be key"), *Gravity Fields* (músculos, huesos, oído interno y órganos "must adjust to the new gravities"), *Hostile/Closed Environments* (temperatura, presión, luz, ruido, microbios). No usa el acrónimo RIDGE | Rueda de peligros; "¿Por qué importa?" de cada indicador |
| [NASA HRP · Risks](https://www.nasa.gov/hrp/risks/) | **sí** | 17 riesgos en 3 áreas. Entre ellos: *Cardiovascular Adaptations*, *Hypoxia*, *Inadequate Sleep and Irregular Schedules*, *Behavioral Changes and Psychiatric Disorders*, *Inadequate Food and Nutrition*, *Spaceflight-Induced Bone Changes*, *Reduced Cardiorespiratory and Musculoskeletal Fitness*, *SANS*, *Radiation-Induced Cancers* | hr/bp → Cardiovascular; spo2 → Hypoxia; sleep → Sleep; mood → Behavioral; glu → Food and Nutrition; huesos/músculo → Bone / Musculoskeletal |
| [NASA HRP · Ongoing research](https://www.nasa.gov/hrp/ongoing-hrp-research/) | **sí** | Estudios de Artemis II (ARCHeR: bienestar, actividad y sueño; Immune Biomarkers; Standard Measures) y de órbita baja (CIPHER, Brain Fluid Pressure, Thigh Cuff, Venous Haemostasis, Zero T2…) | Fuentes y ciencia |
| [Spaceflight Standard Measures](https://www.nasa.gov/reference/standard-measures/) | **sí** | Conjunto estandarizado antes, durante y después del vuelo: actividad y luz (sensor de muñeca), reportes de sueño, nutrición, inmunidad (saliva), cognición, sensoriomotor/vestibular, fuerza, microbioma, sangre. **No menciona signos vitales continuos** (ni FC ni presión) | Alinear: sleep, mood (cognición/conducta), luz y actividad; aviso de que no todos los datos NASA son vitales continuos |
| [CSA · Monitoring radiation and astronaut health (26/02/2026)](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp) | **no** (tiempo de espera agotado) | **referencia a confirmar** | Radiación |
| [CSA · Why science experiments in space](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp) | **no** (tiempo de espera agotado) | **referencia a confirmar** | Fuentes y ciencia |
| [NASA OSDR](https://osdr.nasa.gov/bio/repo/) | **solo el título** ("NASA OSDR: Open Science for Life in Space"; la página necesita JavaScript) | **referencia a confirmar** | Fuentes y ciencia |
| [NASA Life Sciences Data Portal](https://nlsp.nasa.gov/) | **solo el título** ("NASA Life Sciences Portal (NLSP)") | **referencia a confirmar** | Fuentes y ciencia |

**Importante:** los rangos normales de los indicadores (p. ej. FC 50–90 lpm) vienen
de `crewData.js` / `backend/data/crew.json`, definidos por el equipo. **No son
REFERENCIA NASA** y no se rotularán así. Ninguna de las páginas leídas da rangos
numéricos.
