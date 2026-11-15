# Paleta y tipografía originales (origin/main)

Valores extraídos con `git show origin/main:frontend/src/styles/tokens.css` (commit `14731e8`)
y de los demás CSS de esa carpeta. La rama `web-wow` vuelve a esta identidad: terminal de
misión en fósforo verde sobre casi negro, la misma del DINO PAD físico.

## Tokens (`tokens.css` de origin/main)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#080d0a` | Fondo general |
| `--bg-raised` | `#0c140f` | Superficie elevada |
| `--panel` | `#0e1711` | Paneles |
| `--panel-hi` | `#111d14` | Botones, panel resaltado |
| `--line` | `#23332a` | Reglas y bordes |
| `--line-bright` | `#38503d` | Bordes resaltados |
| `--text` | `#d8e6d9` | Texto |
| `--muted` | `#84958a` | Texto secundario |
| `--green` | `#a4ff70` | Fósforo: identidad y estado Normal |
| `--green-dim` | `#5da64a` | Fósforo atenuado |
| `--amber` | `#ffc66d` | Semáforo: Atención |
| `--red` | `#ff6b63` | Semáforo: Crítico |
| `--blue` | `#78c9d4` | Alertas informativas |
| selección | texto `#081009` sobre `--green` | `::selection` |

## Valores sueltos en layout/components/pages de origin/main

| Valor | Dónde |
|---|---|
| `#0a100c` | Fondo de la barra lateral |
| `#080d0aee` | Barra superior (con `backdrop-filter: blur(12px)`) |
| `#0a110c` | Campos, gráfica de historial, botones de escenario |
| `#527346` | Borde del enlace activo |
| `#a4ff700b`, `#a4ff7009` | Tinte verde de elementos activos |
| `#56665a` | Número de sección inactivo |
| `#725d32` | Borde ámbar (simulado, caché) |
| `#8d403a` | Borde rojo (peligro, sin enlace) |
| `#385f3b`, `#3b683e` | Borde de "en vivo" y de sincronizado |
| `#571c1bed`, `#26100f` | Fondo del banner SOS y del SOS activo |
| `#4a7142` | Leyenda del rango normal |
| `#9bff6d03` | Líneas de barrido (`scanlines`) |
| `#a4ff7099`, `#ffc66d99`, `#ff6b6399` | Brillo de los puntos de estado |

`index.html` usaba `theme-color: #39ff14`; el manifest, `background_color: #050805` y
`theme_color: #39ff14` (el manifest vuelve a ser el de origin/main).

## Tipografía original

Una sola familia monoespaciada del sistema para todo:
`"Cascadia Code", "SFMono-Regular", Consolas, monospace`, pesos 400, 500 y 800 (marca).
Tamaños muy pequeños (7 a 12 px en casi todo; 25 px en los valores).

## Qué cambia respecto al original y por qué

- **Fuente empaquetada.** La pila original depende de lo que tenga instalado cada equipo
  (en Linux y en celulares cae a la monoespaciada genérica). Para que se vea igual en el
  escenario y sin internet se usa **JetBrains Mono** (OFL, dentro del build) como
  monoespaciada única, con la pila original como respaldo. Chakra Petch (Etapa 1) deja de
  usarse.
- **Tamaños.** Mínimo 11 px (el original bajaba a 7 px, ilegible y sin contraste útil).
- **Ámbar y rojo solo para el semáforo.** El original usaba ámbar para "simulado"; ahora
  DEMO se distingue por borde punteado, trama e icono, sin ámbar.
- **Colores del firmware** (`ui.cpp`, RGB565): fondo `0x0000`, verde `0x07E0`, verde medio
  `0x03E0`, verde oscuro `0x0240`, rojo `0xF800`, amarillo `0xFFE0`, gris `0x8410`,
  blanco `0xFFFF`. Solo se usan dentro de la réplica de la pantalla del DINO PAD.
