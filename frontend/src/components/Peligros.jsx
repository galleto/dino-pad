// Peligros.jsx · Rueda de los 5 peligros del Programa de Investigación Humana (HRP) de la
// NASA y sección "Fuentes y ciencia". Solo se cita lo que el equipo leyó (ver
// docs/cumplimiento-reto.md); lo demás va como "referencia a confirmar".
import { useState } from 'react';
import { HAZARDS } from '../data/crewData';
import { getStatus, STATUS_LABEL } from '../services/health';
import Origen from './Origen';
import { ENTORNOS } from './entornos';
import { entornoStore, useStore } from './estadoMision';
import { zonaStore } from './seleccion';
import { URL_PELIGROS } from './zonasCuerpo';

const PELIGROS = [
  { id: 'radiation', corto: 'Radiación', nasa: 'Space Radiation', dice: 'El HRP la describe como "one of the most hazardous aspects of spaceflight" (uno de los aspectos más peligrosos del vuelo espacial).' },
  { id: 'isolation', corto: 'Aislamiento', nasa: 'Isolation and Confinement', dice: 'El HRP lo lista como uno de los cinco peligros del vuelo espacial tripulado.' },
  { id: 'distance', corto: 'Distancia', nasa: 'Distance from Earth', dice: 'Según el HRP, "planning and self-sufficiency will be key" (la planeación y la autosuficiencia serán clave).' },
  { id: 'gravity', corto: 'Gravedad', nasa: 'Gravity Fields', dice: 'Según el HRP, músculos, huesos, oído interno y órganos "must adjust to the new gravities" (deben ajustarse a cada nueva gravedad).' },
  { id: 'environment', corto: 'Ambiente', nasa: 'Hostile/Closed Environments', dice: 'El HRP menciona la temperatura, la presión, la luz, el ruido y los microbios del hábitat.' },
];

const polar = (r, grados) => { const a = ((grados - 90) * Math.PI) / 180; return [200 + r * Math.cos(a), 200 + r * Math.sin(a)]; };
function sector(i, r0, r1, hueco = 2.2) {
  const a0 = i * 72 + hueco;
  const a1 = (i + 1) * 72 - hueco;
  const [x0, y0] = polar(r1, a0); const [x1, y1] = polar(r1, a1); const [x2, y2] = polar(r0, a1); const [x3, y3] = polar(r0, a0);
  return `M${x0} ${y0}A${r1} ${r1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`;
}

export function RuedaPeligros({ indicators, crew, latest }) {
  const [sel, setSel] = useState('radiation');
  const [entornoId] = useStore(entornoStore);
  const entorno = ENTORNOS[entornoId] || ENTORNOS.marte;
  const ligados = (id) => Object.values(indicators).filter((ind) => (ind.hazards || []).includes(id));
  const p = PELIGROS.find((x) => x.id === sel);
  return (
    <section className="rueda-seccion" aria-label="Los cinco peligros del vuelo espacial">
      <svg className="rueda" viewBox="0 0 400 400" role="group" aria-label="Rueda de los cinco peligros del HRP de la NASA">
        <circle cx="200" cy="200" r="196" className="rueda-aro" />
        {Array.from({ length: 60 }, (_, k) => { const [x0, y0] = polar(k % 5 ? 188 : 183, k * 6); const [x1, y1] = polar(194, k * 6); return <path key={k} d={`M${x0} ${y0}L${x1} ${y1}`} className="rueda-marca" />; })}
        {PELIGROS.map((pel, i) => {
          const [tx, ty] = polar(128, i * 72 + 36);
          const destacado = entorno.peligros.includes(pel.id);
          const n = ligados(pel.id).length;
          return (
            <g key={pel.id} className={`rueda-sector${sel === pel.id ? ' is-selected' : ''}${destacado ? ' is-destacado' : ''}`} role="button" tabIndex="0" aria-pressed={sel === pel.id}
              aria-label={`${HAZARDS[pel.id]}: ${n} indicadores ligados${destacado ? `; destacado en ${entorno.nombre}` : ''}`}
              onClick={() => setSel(pel.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(pel.id); } }}>
              <path d={sector(i, 78, 176)} className="rueda-cuerpo" />
              {destacado && <path d={sector(i, 178, 182, 4)} className="rueda-destaque" />}
              <text x={tx} y={ty - 2} textAnchor="middle" className="rueda-nombre">{pel.corto}</text>
              <text x={tx} y={ty + 15} textAnchor="middle" className="rueda-cuenta">{n} {n === 1 ? 'indicador' : 'indicadores'}</text>
            </g>
          );
        })}
        <text x="200" y="192" textAnchor="middle" className="rueda-centro-n">5</text>
        <text x="200" y="212" textAnchor="middle" className="rueda-centro">peligros</text>
        <text x="200" y="226" textAnchor="middle" className="rueda-centro">HRP · NASA</text>
      </svg>
      <div className="rueda-detalle" aria-live="polite">
        <h2>{HAZARDS[p.id]}</h2>
        <p className="rueda-nasa"><Origen tipo="nasa" compact /> <a href={URL_PELIGROS} target="_blank" rel="noreferrer">{p.nasa}</a></p>
        <p>{p.dice}</p>
        <p className="rueda-entorno">{entorno.peligros.includes(p.id) ? `Destacado en el entorno elegido (${entorno.nombre}); el arco exterior lo marca.` : `No es de los más destacados en el entorno elegido (${entorno.nombre}), pero sigue presente.`} <span>Qué se destaca en cada entorno es criterio del proyecto.</span></p>
        <h3>Indicadores que vigila DINO PAD por este peligro</h3>
        {ligados(p.id).length ? (
          <ul className="rueda-indicadores">
            {ligados(p.id).map((ind) => {
              const reading = latest?.[ind.id];
              const st = getStatus(ind, crew, reading);
              return (
                <li key={ind.id} className={`st-${st}`}>
                  <a href="#/monitoreo" onClick={() => zonaStore.set(ind.id)}><strong>{ind.name}</strong></a>
                  <span className="st-glyph">{reading?.value ?? '—'} {ind.unit} · {STATUS_LABEL[st]}</span>
                  <p>{ind.why}</p>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">Ningún indicador del prototipo está ligado a este peligro todavía.</p>}
        <p className="rueda-nota">Qué indicador se liga a cada peligro y el texto de su efecto los escribió el equipo; no son citas de la NASA.</p>
      </div>
    </section>
  );
}

const FUENTES = [
  { titulo: 'NASA HRP · 5 Hazards of Human Spaceflight', url: 'https://www.nasa.gov/hrp/hazards/', leida: true, que: 'Los cinco peligros del vuelo espacial tripulado.', liga: 'Rueda de peligros y "¿Por qué importa?" de cada indicador.' },
  { titulo: 'NASA HRP · Human Research Roadmap: Risks', url: 'https://www.nasa.gov/hrp/risks/', leida: true, que: 'Lista de riesgos de salud que estudia el HRP.', liga: 'Corazón y presión (Cardiovascular Adaptations), SpO₂ (Hypoxia), sueño, ánimo, glucosa (nutrición), huesos, músculo y ojos (SANS).' },
  { titulo: 'NASA HRP · Ongoing research', url: 'https://www.nasa.gov/hrp/ongoing-hrp-research/', leida: true, que: 'Estudios en curso, entre ellos los de Artemis II (sueño y actividad, biomarcadores inmunes, Standard Measures).', liga: 'Zona "Sistema inmune" de la figura; sueño y ánimo.' },
  { titulo: 'NASA · Spaceflight Standard Measures', url: 'https://www.nasa.gov/reference/standard-measures/', leida: true, que: 'Conjunto estandarizado de mediciones antes, durante y después del vuelo: actividad y luz, sueño, nutrición, inmunidad, cognición, fuerza, entre otras.', liga: 'Sueño, ánimo, y la luz que mide el T1000-E.' },
  { titulo: 'CSA · Monitoring radiation and astronaut health (26/02/2026)', url: 'https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp', leida: false, que: 'Artículo de la Agencia Espacial Canadiense. No pudimos abrirlo: no citamos su contenido.', liga: 'Peligro "Radiación espacial".' },
  { titulo: 'CSA · Why do we conduct science experiments in space?', url: 'https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp', leida: false, que: 'Página de la Agencia Espacial Canadiense. No pudimos abrirla: no citamos su contenido.', liga: 'Contexto general.' },
  { titulo: 'NASA OSDR · Open Science Data Repository', url: 'https://osdr.nasa.gov/bio/repo/', leida: false, que: 'Repositorio de datos abiertos de ciencias de la vida en el espacio. Solo vimos su título: no citamos su contenido.', liga: 'Posible fuente de datos futuros.' },
  { titulo: 'NASA Life Sciences Portal (NLSP)', url: 'https://nlsp.nasa.gov/', leida: false, que: 'Portal de datos de ciencias de la vida de la NASA. Solo vimos su título: no citamos su contenido.', liga: 'Posible fuente de datos futuros.' },
];

export function FuentesCiencia() {
  return (
    <section className="fuentes" aria-label="Fuentes y ciencia">
      <header className="col-head"><h2>Fuentes y ciencia</h2><span>{FUENTES.filter((f) => f.leida).length} leídas · {FUENTES.filter((f) => !f.leida).length} por confirmar</span></header>
      <p className="fuentes-aviso">No todos los conjuntos de datos de la NASA traen signos vitales continuos. Las Spaceflight Standard Measures que leímos hablan de actividad, luz, sueño, nutrición, inmunidad y cognición, y no mencionan frecuencia cardíaca ni presión medidas de forma continua. Por eso los rangos de DINO PAD son del proyecto y sus lecturas de pulso y SpO₂ son DEMO.</p>
      <ol className="fuentes-lista">
        {FUENTES.map((f) => (
          <li key={f.url}>
            <div>{f.leida ? <Origen tipo="nasa" compact /> : <span className="tag">REFERENCIA A CONFIRMAR</span>}</div>
            <div><a href={f.url} target="_blank" rel="noreferrer">{f.titulo}</a><p>{f.que}</p><p className="fuentes-liga">Se vincula con: {f.liga}</p></div>
          </li>
        ))}
      </ol>
      <p className="fuentes-aviso">Cálculos propios: la hora de Marte usa las fórmulas del algoritmo Mars24 de NASA GISS y el retraso de la señal es una estimación con órbitas circulares (referencias a confirmar). Las coordenadas de la base Jezero vienen del firmware, que cita a NASA GISS.</p>
    </section>
  );
}
