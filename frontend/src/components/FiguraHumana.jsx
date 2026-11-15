// FiguraHumana.jsx · Figura humana propia en SVG, hecha de cortes horizontales
// (como un escaneo por capas). Cada zona toma el color del semáforo de su indicador
// y se puede seleccionar con clic, toque o teclado. Solo presentación.
import { useMemo } from 'react';
import { getStatus, STATUS_LABEL } from '../services/health';

const CX = 240;
const GLIFO = { ok: '●', warn: '▲', crit: '■', nodata: '○' };

// Interpolación lineal sobre una tabla [[y, valor], ...]
function perfil(tabla, y) {
  if (y < tabla[0][0] || y > tabla.at(-1)[0]) return null;
  for (let i = 1; i < tabla.length; i++) {
    const [y0, v0] = tabla[i - 1];
    const [y1, v1] = tabla[i];
    if (y <= y1) return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0 || 1);
  }
  return null;
}

const TORSO = [[118, 20], [128, 56], [140, 66], [172, 62], [240, 47], [270, 48], [306, 58], [338, 58]];
const BRAZO_X = [[132, 74], [200, 84], [280, 92], [352, 100], [390, 102]];
const BRAZO_W = [[132, 9], [150, 13], [230, 11], [330, 8], [352, 8], [366, 11], [390, 4]];
const PIERNA_X = [[338, 29], [460, 26], [590, 24], [612, 28]];
const PIERNA_W = [[338, 29], [400, 26], [455, 17], [490, 19], [540, 13], [590, 10], [600, 17], [612, 14]];

// Tramos [x0, x1] que ocupa el cuerpo a la altura y
function corte(y) {
  const tramos = [];
  const d = (y - 64) / 40;
  if (Math.abs(d) < 1) { const w = 31 * Math.sqrt(1 - d * d); tramos.push([CX - w, CX + w]); }
  if (y >= 98 && y <= 122) tramos.push([CX - 13, CX + 13]);
  const t = perfil(TORSO, y);
  if (t != null) tramos.push([CX - t, CX + t]);
  const bx = perfil(BRAZO_X, y);
  const bw = perfil(BRAZO_W, y);
  if (bx != null && bw != null) { tramos.push([CX - bx - bw, CX - bx + bw]); tramos.push([CX + bx - bw, CX + bx + bw]); }
  const px = perfil(PIERNA_X, y);
  const pw = perfil(PIERNA_W, y);
  if (px != null && pw != null) { tramos.push([CX - px - pw, CX - px + pw]); tramos.push([CX + px - pw, CX + px + pw]); }
  tramos.sort((a, b) => a[0] - b[0]);
  const unidos = [];
  tramos.forEach((tr) => {
    const ult = unidos.at(-1);
    if (ult && tr[0] <= ult[1] + 1) ult[1] = Math.max(ult[1], tr[1]);
    else unidos.push([...tr]);
  });
  return unidos;
}

function trazoCuerpo(paso, desfase = 0) {
  let d = '';
  for (let y = 26 + desfase; y <= 612; y += paso) {
    corte(y).forEach(([x0, x1]) => { d += `M${x0.toFixed(1)} ${y}H${x1.toFixed(1)}`; });
  }
  return d;
}

// Zonas: forma, ancla de la línea guía y posición del rótulo
const ZONAS = [
  { id: 'sleep', nombre: 'Sueño', lado: 'izq', ly: 46, ancla: [226, 54],
    forma: <path d="M238 36 A21 18 0 0 0 238 72 Z" /> },
  { id: 'mood', nombre: 'Ánimo', lado: 'der', ly: 46, ancla: [254, 54],
    forma: <path d="M242 36 A21 18 0 0 1 242 72 Z" /> },
  { id: 'temp', nombre: 'Temperatura', lado: 'der', ly: 104, ancla: [270, 84],
    forma: <><circle cx="268" cy="84" r="6.5" /><circle cx="268" cy="84" r="12" className="fig-halo" /></> },
  { id: 'spo2', nombre: 'Pulmones', lado: 'izq', ly: 168, ancla: [206, 186],
    forma: <><path d="M230 150 C212 150 198 178 198 214 C198 230 228 226 230 212 Z" /><path d="M252 150 C270 150 284 178 284 214 C284 230 254 226 252 212 Z" /></> },
  { id: 'hr', nombre: 'Corazón', lado: 'der', ly: 192, ancla: [262, 198],
    forma: <path d="M243 180 C256 173 268 185 264 199 C261 211 250 218 243 221 C235 212 232 195 243 180 Z" /> },
  { id: 'bp', nombre: 'Presión', lado: 'izq', ly: 236, ancla: [146, 206],
    forma: <><rect x="144" y="192" width="27" height="28" rx="3" /><path d="M144 201H171M144 211H171" className="fig-detalle" /></> },
  { id: 'glu', nombre: 'Glucosa', lado: 'der', ly: 282, ancla: [266, 266],
    forma: <ellipse cx="242" cy="268" rx="27" ry="11" transform="rotate(-9 242 268)" /> },
];

export default function FiguraHumana({ crew, indicators, latest, selected, onSelect }) {
  const cuerpo = useMemo(() => trazoCuerpo(6), []);
  const cuerpoFino = useMemo(() => trazoCuerpo(6, 3), []);
  return (
    <svg className="figura" viewBox="0 0 480 640" role="group" aria-label="Figura humana con zonas seleccionables. Cada zona muestra el estado de su indicador.">
      {/* Plataforma y ejes del escáner */}
      <g className="fig-base" aria-hidden="true">
        <ellipse cx={CX} cy="616" rx="118" ry="13" />
        <ellipse cx={CX} cy="616" rx="84" ry="9" />
        <ellipse cx={CX} cy="616" rx="46" ry="5" />
        <path d={`M${CX} 12V22M${CX} 606V630`} />
      </g>
      <path className="fig-cuerpo-fino" d={cuerpoFino} aria-hidden="true" />
      <path className="fig-cuerpo" d={cuerpo} aria-hidden="true" />
      <defs><linearGradient id="fig-grad-barrido" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a4ff70" stopOpacity="0" /><stop offset="1" stopColor="#a4ff70" stopOpacity=".28" /></linearGradient></defs>
      <rect className="fig-barrido" x="130" y="0" width="220" height="40" fill="url(#fig-grad-barrido)" aria-hidden="true" />
      {ZONAS.map((zona) => {
        const indicator = indicators[zona.id];
        if (!indicator) return null;
        const reading = latest?.[zona.id];
        const status = getStatus(indicator, crew, reading);
        const valor = reading?.quality === 'no_signal' || reading?.value == null ? '—' : reading.value;
        const activa = selected === zona.id;
        const izq = zona.lado === 'izq';
        const lx = izq ? 10 : 470;
        const codo = izq ? 96 : 384;
        const elegir = () => onSelect(zona.id);
        return (
          <g key={zona.id} className={`fig-zona st-${status}${activa ? ' is-selected' : ''}`} role="button" tabIndex="0" aria-pressed={activa}
            aria-label={`${zona.nombre}: ${indicator.name}, ${valor} ${indicator.unit}, ${STATUS_LABEL[status]}`}
            onClick={elegir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } }}>
            <polyline className="fig-guia" points={`${zona.ancla[0]},${zona.ancla[1]} ${codo},${zona.ly + 8} ${lx},${zona.ly + 8}`} />
            <g className="fig-forma">{zona.forma}</g>
            <rect className="fig-toque" x={izq ? 4 : 380} y={zona.ly - 30} width="96" height="42" />
            <text className="fig-nombre" x={lx} y={zona.ly - 14} textAnchor={izq ? 'start' : 'end'}>{zona.nombre}</text>
            <text className="fig-valor" x={lx} y={zona.ly + 2} textAnchor={izq ? 'start' : 'end'}>{GLIFO[status]} {valor}<tspan className="fig-unidad"> {indicator.unit}</tspan></text>
          </g>
        );
      })}
    </svg>
  );
}
