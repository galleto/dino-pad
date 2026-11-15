// FiguraHumana.jsx · Figura humana propia en SVG, hecha de cortes horizontales
// (como un escaneo por capas). Cada zona toma el color del semáforo de su indicador
// y se puede seleccionar con clic, toque o teclado. Solo presentación.
import { useMemo } from 'react';
import { getStatus, STATUS_LABEL } from '../services/health';
import { CX, partesEn } from './cuerpo';

const GLIFO = { ok: '●', warn: '▲', crit: '■', nodata: '○' };

// Tramos [x0, x1] que ocupa el cuerpo a la altura y
function corte(y) {
  const tramos = partesEn(y).map((p) => [p.cx - p.hw, p.cx + p.hw]);
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

// Zonas: forma, ancla de la línea guía y posición del rótulo.
// Con `ref` no hay indicador: se dibujan como referencia, sin color de semáforo.
const ZONAS = [
  { id: 'sleep', nombre: 'Sueño', lado: 'izq', ly: 40, ancla: [226, 48],
    forma: <path d="M238 33 A20 15 0 0 0 238 63 Z" /> },
  { id: 'mood', nombre: 'Ánimo', lado: 'der', ly: 40, ancla: [254, 48],
    forma: <path d="M242 33 A20 15 0 0 1 242 63 Z" /> },
  { id: 'ojos', ref: true, nombre: 'Ojos', lado: 'izq', ly: 98, ancla: [222, 74],
    forma: <><ellipse cx="229" cy="74" rx="6" ry="3.5" /><ellipse cx="251" cy="74" rx="6" ry="3.5" /></> },
  { id: 'temp', nombre: 'Temperatura', lado: 'der', ly: 98, ancla: [272, 86],
    forma: <><circle cx="268" cy="86" r="5.5" /><circle cx="268" cy="86" r="10" className="fig-halo" /></> },
  { id: 'spo2', nombre: 'Pulmones', lado: 'izq', ly: 168, ancla: [206, 186],
    forma: <><path d="M230 150 C212 150 198 178 198 214 C198 230 228 226 230 212 Z" /><path d="M252 150 C270 150 284 178 284 214 C284 230 254 226 252 212 Z" /></> },
  { id: 'hr', nombre: 'Corazón', lado: 'der', ly: 176, ancla: [262, 198],
    forma: <path className="fig-late" d="M243 180 C256 173 268 185 264 199 C261 211 250 218 243 221 C235 212 232 195 243 180 Z" /> },
  { id: 'inmune', ref: true, nombre: 'Inmune', lado: 'der', ly: 232, ancla: [300, 172],
    forma: <><circle cx="297" cy="160" r="4" /><circle cx="302" cy="172" r="4" /><circle cx="294" cy="178" r="3.4" /></> },
  { id: 'bp', nombre: 'Presión', lado: 'izq', ly: 236, ancla: [146, 206],
    forma: <><rect x="144" y="192" width="27" height="28" rx="3" /><path d="M144 201H171M144 211H171" className="fig-detalle" /></> },
  { id: 'glu', nombre: 'Glucosa', lado: 'der', ly: 290, ancla: [266, 266],
    forma: <ellipse cx="242" cy="268" rx="27" ry="11" transform="rotate(-9 242 268)" /> },
  { id: 'huesos', ref: true, nombre: 'Huesos', lado: 'izq', ly: 400, ancla: [206, 400],
    forma: <path d="M208 356 a5 5 0 1 1 8 0 l1 82 a5 5 0 1 1 -10 0 Z" /> },
  { id: 'musculo', ref: true, nombre: 'Músculo', lado: 'der', ly: 400, ancla: [276, 400],
    forma: <><path d="M266 352 C280 372 280 420 268 446 C258 420 258 372 266 352 Z" /><path d="M267 362 V436" className="fig-detalle" /></> },
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
      <defs><linearGradient id="fig-grad-barrido" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a4ff70" stopOpacity="0" /><stop offset="1" stopColor="#a4ff70" stopOpacity=".16" /></linearGradient></defs>
      <rect className="fig-barrido" x="130" y="0" width="220" height="40" fill="url(#fig-grad-barrido)" aria-hidden="true" />
      {ZONAS.map((zona) => {
        const indicator = zona.ref ? null : indicators[zona.id];
        if (!zona.ref && !indicator) return null;
        const reading = latest?.[zona.id];
        const status = indicator ? getStatus(indicator, crew, reading) : 'ref';
        const valor = reading?.quality === 'no_signal' || reading?.value == null ? '—' : reading.value;
        const activa = selected === zona.id;
        const izq = zona.lado === 'izq';
        const lx = izq ? 10 : 470;
        const codo = izq ? 96 : 384;
        const elegir = () => onSelect(zona.id);
        // Latido al ritmo de la frecuencia cardíaca recibida (la lectura lleva su propio origen)
        const latido = zona.id === 'hr' && Number(valor) > 0 ? { '--latido': `${(60 / Math.min(220, Math.max(30, Number(valor)))).toFixed(2)}s` } : undefined;
        return (
          <g key={zona.id} className={`fig-zona st-${status}${activa ? ' is-selected' : ''}`} style={latido} role="button" tabIndex="0" aria-pressed={activa}
            aria-label={indicator ? `${zona.nombre}: ${indicator.name}, ${valor} ${indicator.unit}, ${STATUS_LABEL[status]}` : `${zona.nombre}: sin sensor en este prototipo, información de referencia`}
            onClick={elegir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } }}>
            <polyline className="fig-guia" points={`${zona.ancla[0]},${zona.ancla[1]} ${codo},${zona.ly + 8} ${lx},${zona.ly + 8}`} />
            <g className="fig-forma">{zona.forma}</g>
            <rect className="fig-toque" x={izq ? 4 : 380} y={zona.ly - 30} width="96" height="42" />
            <text className="fig-nombre" x={lx} y={zona.ly - 14} textAnchor={izq ? 'start' : 'end'}>{zona.nombre}</text>
            {indicator
              ? <text className="fig-valor" x={lx} y={zona.ly + 2} textAnchor={izq ? 'start' : 'end'}>{GLIFO[status]} {valor}<tspan className="fig-unidad"> {indicator.unit}</tspan></text>
              : <text className="fig-sin-sensor" x={lx} y={zona.ly + 2} textAnchor={izq ? 'start' : 'end'}>◇ sin sensor</text>}
          </g>
        );
      })}
    </svg>
  );
}
