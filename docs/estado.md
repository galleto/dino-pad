# Estado del trabajo (web-wow)

Actualizado: 15/11/2026. Node: `~/.nvm/versions/node/v26.13.1/bin` (no está en el PATH).

## Pieza A · Base visual (TERMINADA, commit hecho; esperando el OK del usuario)

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

## Siguiente
B figura (dossier, latido, más zonas) · C DINO PAD EN VIVO · D tormenta solar · E a I.

## Decisiones
- Navegación arriba en pestañas (hermana del firmware) en lugar de barra lateral.
- Ámbar/rojo solo semáforo: DEMO se marca con borde punteado + trama + icono.
- Chakra Petch ya no se importa (la dependencia sigue en package.json; decidir si se quita).
- Los rótulos pequeños en mayúsculas de Monitoreo/Laboratorio pasan a texto secundario
  junto al título (no se eliminó ningún texto).
