# Estado del trabajo (web-wow)

Actualizado: 15/11/2026. Node: `~/.nvm/versions/node/v26.13.1/bin` (no está en el PATH).

## Pieza A · Base visual (TERMINADA, commit 280d0ed; OK del usuario recibido)

- `docs/paleta-original.md`: valores exactos de origin/main.
- `tokens.css`, `layout.css`, `components.css`, `pages.css` reescritos: paleta original,
  JetBrains Mono única, semáforo con glifo (`.st-*`), panel plano con marcas de esquina.
  `pages.css` parte del original (tamaños subidos a 11 px o más) + capa nueva.
- `App.jsx`: barra de título + fila de pestañas (como el DINO PAD) en vez de barra lateral;
  en celular las pestañas van abajo con desplazamiento horizontal. Lógica intacta.
- `Origen.jsx`: `ClaveOrigen` (popover compacto en la barra) y `LeyendaOrigen` como lista.
- Monitoreo: `VitalCard.jsx` (canal con escala y aguja), `FiguraHumana.jsx` (figura SVG por
  cortes, 7 zonas seleccionables), `VitalMetrics.jsx` (3 columnas; "Vista 3D" opcional).
- Laboratorio: conmutador de escenarios con los efectos de cada uno.
- Build y lint sin errores ni advertencias. Capturas en `docs/capturas/A-*.png`.

Cómo capturar: `npx vite preview --port 4317` y
`firefox --headless --profile <dir fijo> --window-size W,H --screenshot out.png URL`
(con el mismo perfil se acumulan lecturas en la caché y aparecen las minigráficas).

Sin verificar en A: interacción (clic en zonas/canales, popover, Vista 3D con WebGL), SOS y
backend real. Firefox sin interfaz solo captura al cargar.

## Pieza B · Figura humana y dossier (TERMINADA)

- `zonasCuerpo.js`: textos del equipo (función, cuándo avisar) y riesgo HRP leído por zona.
- `FiguraHumana.jsx`: 11 zonas (7 con indicador y semáforo; ojos, huesos, músculo e inmune
  como referencia "sin sensor" en azul punteado); corazón late al ritmo de la FC (`--latido`).
- `Dossier.jsx`: función, valor + gráfica con banda, rango, qué/cómo se mide, por qué importa
  (peligros HRP + riesgo HRP con rótulo REFERENCIA NASA), qué hacer, cuándo avisar. En pantallas
  de 1560 px o menos entra como cajón fijo. Escape lo cierra.
- `VitalCard.jsx`: botón "¿Por qué importa?" por canal (abre el dossier en esa sección).
- Probado con Playwright (clic, teclado, Escape, cambio de tripulante, 1920/1366/390; sin
  errores de consola). Vista 3D: en Firefox sin interfaz no hay WebGL, se ve el respaldo.

Pruebas: Playwright vive FUERA del repo en `~/.cache/dinopad-pw` (`node b.mjs <dir-salida>`,
con `npx vite preview --port 4317` corriendo en frontend/).

## Pieza C · DINO PAD EN VIVO (TERMINADA)

- `frontend/src/dinopad/maquina.js`: port de botones.cpp, demo.h, posicion_demo.h,
  simulador_vital.h y manejar(). 17 comprobaciones con Node (botones, SOS 3 s, guion DEMO).
- `frontend/src/dinopad/pantalla.js`: renderizador 320x240 según ui.cpp (fuente 5x7 de
  Adafruit GFX transcrita: confirmar contra el dispositivo).
- `components/DinoPadPage.jsx` + `styles/dinopad.css`: carcasa propia, 3 botones (ratón, toque
  y teclado), DEMO AUTO, SOS de PRUEBA con barra, insignia SIMULADO / EN VIVO, cadena de datos.
  Ruta `#/dinopad` (pestaña 09). Los cambios de botón llevan su hora (no se pierden pulsaciones
  cortas con pocos cuadros por segundo).
- `components/seleccion.js`: zona seleccionada compartida figura <-> DINO PAD (entrar a VITAL
  selecciona el corazón; el dossier de FC/SpO2 enlaza al DINO PAD).
- `docs/propuesta-espejo.md`: espejo exacto y telemetría del tracker (PROPUESTA).
- Playwright (`~/.cache/dinopad-pw/c.mjs`): pestañas, ROJO largo, MENS no envía, SOS de prueba
  (no dispara el banner SOS real), vínculo con la figura, DEMO AUTO, sin errores de consola.

Sin verificar en C: insignia "EN VIVO" (necesita lecturas `live` del backend), fidelidad de
la fuente contra el dispositivo físico, toque con dos dedos en un celular real.

## Pieza D · Modo tormenta solar (TERMINADA)

- `components/Tormenta.jsx`, `estadoMision.js` (stores de presentación), `sonido.js`
  (Web Audio, apagado por defecto). Estilos al final de `layout.css` (`.modo-tormenta`).
- Se enciende con una alerta cuyo texto hable de radiación/tormenta solar, o con el botón
  "Simulacro de tormenta solar" de Laboratorio (que además pone el escenario "Tormenta solar").
- Cuenta regresiva de 10 min (regla del simulacro), 5 pasos marcables y pase de lista.
- No crea, cambia ni reconoce alertas. Playwright: se enciende, persiste al navegar, se
  apaga, no aparece banner SOS, sin errores de consola.
- Sin verificar: activación por una alerta real de radiación del backend (hoy ninguna regla
  la genera; el detector busca el texto en título/mensaje).

## Piezas E a I (TERMINADAS)

- E `BarraMision.jsx`, `entornos.js`: UTC, MTC (Mars24, verificado MSD 44796.0 el 06/01/2000),
  retraso con órbitas circulares (4.4 a 21 min), 5 entornos; el dossier usa el retraso.
- F `Peligros.jsx`: rueda de 5 peligros y fuentes, dentro de Riesgos NASA.
- G `BitacoraPage.jsx`, `registro.js`, `TrazoEcg.jsx`, `trazos.js`: registro local y gamificación.
- H `MapaPage.jsx`: radar de Jezero (coordenadas de `dinopad/maquina.js`).
- I `Intro.jsx`, `Presentacion.jsx`, `sonido.js`.

## Verificación adicional (15/11/2026)
- Ruta `live` probada con un backend de prueba (`~/.cache/dinopad-pw/mock.mjs` + `live.mjs`).
- Capturas de celular de D, G y H revisadas; cabecera en celular corregida (la píldora se cortaba).
- La insignia EN VIVO aclara que solo las lecturas vienen del backend; estado, ambiente y nodos siguen DEMO.

## Pendiente / ideas
- Probar con backend real (EN VIVO, SOS, alerta de radiación) y con el dispositivo.
- Confirmar las 4 fuentes no leídas y las referencias de Mars24.
- Decidir si se quita la dependencia `@fontsource/chakra-petch` (ya no se usa).
- PROPUESTAS de contrato: espejo de interfaz y telemetría del tracker (`propuesta-espejo.md`);
  enviar el registro del usuario al backend.
- Notificaciones del sistema para recordatorios; entrada por cámara.

## Decisiones
- Navegación arriba en pestañas (hermana del firmware) en lugar de barra lateral.
- Ámbar/rojo solo semáforo y alarma (modo tormenta): DEMO se marca con borde punteado + trama.
- Los rótulos pequeños en mayúsculas pasaron a texto secundario junto al título.
- Pruebas: Playwright fuera del repo, en `~/.cache/dinopad-pw` (`lib.mjs` + un guion por pieza).
