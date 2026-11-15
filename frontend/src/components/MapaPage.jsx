// MapaPage.jsx · Mapa de Jezero con radar. Base y tripulantes usan las coordenadas DEMO de
// firmware/dinopad_pipboy/posicion_demo.h (portadas en dinopad/maquina.js). El relieve es
// un dibujo ilustrativo propio, no cartografía. Nada de esto es una posición real.
import { useEffect, useMemo, useState } from 'react';
import { useConnection } from '../hooks/useConnection';
import { getOverallStatus, STATUS_LABEL } from '../services/health';
import { aGrados, desplazamiento, distanciaM, POSDEMO, rumbo } from '../dinopad/maquina';
import Origen from './Origen';
import '../styles/mapa.css';

const ESCALA = 0.5;   // px del dibujo por metro (radio útil: 480 m)
const C = 300;

// Curvas de nivel ilustrativas: anillos deformados alrededor de dos "lomas" fijas
function relieve() {
  const curvas = [];
  [[-150, -120, 5], [190, 150, 4], [60, -230, 3]].forEach(([cx, cy, n], k) => {
    for (let i = 1; i <= n; i++) {
      let d = '';
      for (let a = 0; a <= 360; a += 12) {
        const r = i * 26 * (1 + 0.16 * Math.sin((a * Math.PI) / 60 + k * 2 + i) + 0.1 * Math.cos((a * Math.PI) / 36 + k));
        d += `${a ? 'L' : 'M'}${(C + cx + r * Math.cos((a * Math.PI) / 180)).toFixed(1)} ${(C + cy + r * Math.sin((a * Math.PI) / 180)).toFixed(1)}`;
      }
      curvas.push(`${d}Z`);
    }
  });
  return curvas;
}

export default function MapaPage() {
  const data = useConnection();
  const [seg, setSeg] = useState(() => Math.floor(performance.now() / 1000));
  const curvas = useMemo(() => relieve(), []);
  useEffect(() => {
    const id = setInterval(() => setSeg(Math.floor(performance.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const puntos = [
    { crewId: 'comandante', corto: 'BASE', norte: 0, este: 0, enBase: true },
    ...POSDEMO.TRIPULANTES.map((t, i) => ({ crewId: t.crewId, corto: t.corto, ...desplazamiento(i, seg) })),
  ].map((pt) => {
    const persona = data.crew[pt.crewId];
    const st = persona ? getOverallStatus(persona, data.latest[pt.crewId] || {}) : 'nodata';
    return { ...pt, persona, st, ...aGrados(pt.norte, pt.este), dist: distanciaM(pt.norte, pt.este), rumbo: rumbo(pt.norte, pt.este) };
  });

  return (
    <div className="mapa-pagina">
      <section className="mapa-lienzo" aria-label="Mapa de la zona de la base">
        <svg className="mapa" viewBox="0 0 600 600" role="group" aria-label="Radar de la base Jezero con la posición simulada de la tripulación">
          <defs>
            <clipPath id="mapa-clip"><circle cx={C} cy={C} r="290" /></clipPath>
            <linearGradient id="mapa-haz" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#a4ff70" stopOpacity="0" /><stop offset="1" stopColor="#a4ff70" stopOpacity=".34" /></linearGradient>
          </defs>
          <g clipPath="url(#mapa-clip)">
            {curvas.map((d, i) => <path key={i} d={d} className="mapa-relieve" />)}
            <path className="mapa-cruz" d={`M${C} 10V590M10 ${C}H590`} />
            <g className="mapa-barrido"><path d={`M${C} ${C}L${C} 10A290 290 0 0 1 ${C + 290 * Math.sin(0.7)} ${C - 290 * Math.cos(0.7)}Z`} fill="url(#mapa-haz)" /><path d={`M${C} ${C}L${C + 290 * Math.sin(0.7)} ${C - 290 * Math.cos(0.7)}`} className="mapa-aguja" /></g>
          </g>
          {[100, 200, 400].map((m) => <g key={m}><circle cx={C} cy={C} r={m * ESCALA} className="mapa-anillo" /><text x={C + 4} y={C - m * ESCALA - 4} className="mapa-escala">{m} m</text></g>)}
          <circle cx={C} cy={C} r="290" className="mapa-borde" />
          {[['N', C, 26], ['E', 580, C + 4], ['S', C, 584], ['O', 20, C + 4]].map(([t, x, y]) => <text key={t} x={x} y={y} textAnchor="middle" className="mapa-rumbo">{t}</text>)}
          {puntos.map((pt) => {
            const x = C + pt.este * ESCALA;
            const y = C - pt.norte * ESCALA;
            const activo = data.activeCrewId === pt.crewId;
            return (
              <g key={pt.crewId} className={`mapa-punto st-${pt.st}${activo ? ' is-activo' : ''}`} role="button" tabIndex="0" aria-pressed={activo}
                aria-label={`${pt.persona?.name || pt.corto}: ${pt.enBase ? 'en la base' : `a ${pt.dist.toFixed(0)} metros al ${pt.rumbo}`}, estado ${STATUS_LABEL[pt.st]}. Posición simulada.`}
                style={{ transform: `translate(${x}px, ${y}px)` }}
                onClick={() => data.setActiveCrewId(pt.crewId)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); data.setActiveCrewId(pt.crewId); } }}>
                {pt.enBase ? <path d="M-9 7L0 -9L9 7Z" className="mapa-base" /> : <><circle r="13" className="mapa-eco" /><circle r="5" className="mapa-marca" /></>}
                {activo && <path d="M-16 -10V-16H-10M10 -16H16V-10M16 10V16H10M-10 16H-16V10" className="mapa-mira" />}
                <text x="14" y="-10" className="mapa-nombre">{pt.corto}</text>
              </g>
            );
          })}
        </svg>
      </section>
      <aside className="mapa-lado">
        <div className="section-heading"><div><h2>{POSDEMO.NOMBRE_BASE.replace(', MARTE', '')}</h2><p>Cráter Jezero, Marte · {POSDEMO.BASE_LAT.toFixed(2)}° N, {POSDEMO.BASE_LON.toFixed(2)}° E</p></div><Origen tipo="demo" /></div>
        <p className="mapa-aviso">Posiciones simuladas con las mismas coordenadas DEMO que usa el DINO PAD cuando su tracker no tiene GPS. El relieve del fondo es ilustrativo, no un mapa real.</p>
        <ul className="mapa-lista">
          {puntos.map((pt) => (
            <li key={pt.crewId} className={`st-${pt.st}${data.activeCrewId === pt.crewId ? ' is-activo' : ''}`}>
              <button type="button" onClick={() => data.setActiveCrewId(pt.crewId)} aria-pressed={data.activeCrewId === pt.crewId}>
                <span className="mapa-l-nombre"><strong>{pt.persona?.name || pt.corto}</strong><small>{pt.corto} · {pt.persona?.role}</small></span>
                <span className="mapa-l-dist">{pt.enBase ? 'en la base' : <><b>{pt.dist.toFixed(0)}</b> m {pt.rumbo}</>}</span>
                <span className="mapa-l-coord">{pt.lat.toFixed(5)}° N  {pt.lon.toFixed(5)}° E</span>
                <span className="mapa-l-estado st-glyph">{STATUS_LABEL[pt.st]}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mapa-nota">Coordenadas de la base: sitio de aterrizaje de Perseverance, según el firmware, que cita a NASA GISS (Mars24). Referencia a confirmar. La posición real solo se mostrará cuando el tracker T1000-E tenga GPS y exista el enlace con la web.</p>
        <p className="mapa-nota"><a href="#/dinopad">Ver estas mismas coordenadas en la pestaña TRACK del DINO PAD</a></p>
      </aside>
    </div>
  );
}
