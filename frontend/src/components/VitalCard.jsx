// VitalCard.jsx · Un indicador como canal de instrumento: valor grande, escala con
// la banda del rango normal y la aguja en el valor, trazo reciente y origen del dato.
import { getRanges, getStatus, STATUS_LABEL } from '../services/health';
import Origen from './Origen';
import { lineaSuave } from './trazos';

function MiniChart({ readings = [] }) {
  const values = readings.filter((reading) => reading?.quality !== 'no_signal' && reading?.value != null && Number.isFinite(Number(reading.value))).slice(-18).map((reading) => Number(reading.value));
  if (values.length < 2) return <div className="mini-chart-empty" aria-label="Sin lecturas suficientes para la gráfica">esperando lecturas</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points = lineaSuave(values.map((value, index) => [(index / (values.length - 1)) * 100, 27 - ((value - min) / spread) * 22]), 0.35);
  return <svg className="mini-chart" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="Gráfica miniatura de las últimas lecturas"><path d={points} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}

// Regla graduada: zona de atención (tenue), rango normal (banda) y aguja en el valor.
function Escala({ ranges, value }) {
  const [w0, w1] = ranges.warn;
  const pad = (w1 - w0) * 0.1 || 1;
  const lo = w0 - pad;
  const hi = w1 + pad;
  const pct = (v) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const hasValue = value != null && Number.isFinite(Number(value));
  return (
    <span className="escala" aria-hidden="true">
      <span className="escala-regla">
        <i className="escala-atencion" style={{ left: `${pct(w0)}%`, width: `${pct(w1) - pct(w0)}%` }} />
        <i className="escala-normal" style={{ left: `${pct(ranges.ok[0])}%`, width: `${pct(ranges.ok[1]) - pct(ranges.ok[0])}%` }} />
        {hasValue && <i className="escala-aguja" style={{ left: `${pct(Number(value))}%` }} />}
      </span>
    </span>
  );
}

export default function VitalCard({ indicator, crew, reading, history = [], onSelect, onWhy, selected = false }) {
  const status = getStatus(indicator, crew, reading);
  const ranges = getRanges(indicator, crew);
  const value = reading?.quality === 'no_signal' ? '—' : reading?.value ?? '—';
  return (
    <article className={`canal st-${status}${selected ? ' is-selected' : ''}`}>
      <span className="canal-id">
        {/* El botón del nombre cubre toda la fila (::after); "¿Por qué importa?" queda encima */}
        <button className="canal-btn" type="button" onClick={onSelect} aria-pressed={selected} aria-label={`${indicator.name}: ${value} ${indicator.unit}; ${STATUS_LABEL[status]}`}>{indicator.name}</button>
        <span className="canal-linea"><span className="canal-estado st-glyph">{STATUS_LABEL[status]}</span>{onWhy && <button type="button" className="canal-porque" onClick={onWhy} aria-label={`¿Por qué importa ${indicator.name}?`}>¿Por qué importa?</button>}</span>
      </span>
      <span className="canal-valor"><strong>{value}</strong><span>{indicator.unit}</span></span>
      <span className="canal-escala"><Escala ranges={ranges} value={reading?.quality === 'no_signal' ? null : reading?.value} /><span className="vital-range">normal {ranges.ok[0]}–{ranges.ok[1]} {indicator.unit}</span></span>
      <MiniChart readings={history} />
      <span className="canal-origen">{reading ? <Origen source={reading.source} compact /> : <span className="tag">SIN DATOS</span>}{reading?.quality === 'no_signal' && <span className="canal-sin-senal">SIN SEÑAL</span>}</span>
    </article>
  );
}
