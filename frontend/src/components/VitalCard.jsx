import { getRanges, getStatus, STATUS_LABEL } from '../services/health';
import Origen from './Origen';

function MiniChart({ readings = [], status = 'ok' }) {
  const values = readings.filter((reading) => reading?.quality !== 'no_signal' && reading?.value != null && Number.isFinite(Number(reading.value))).slice(-18).map((reading) => Number(reading.value));
  if (values.length < 2) return <div className="mini-chart-empty" aria-label="Sin lecturas suficientes para la gráfica" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${27 - ((value - min) / spread) * 22}`).join(' ');
  const color = status === 'crit' ? 'var(--red)' : status === 'warn' ? 'var(--amber)' : status === 'ok' ? 'var(--green)' : 'var(--faint)';
  return <svg className="mini-chart" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="Gráfica miniatura de las últimas lecturas"><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}

export default function VitalCard({ indicator, crew, reading, history = [], onSelect, selected = false }) {
  const status = getStatus(indicator, crew, reading);
  const ranges = getRanges(indicator, crew);
  const value = reading?.quality === 'no_signal' ? '—' : reading?.value ?? '—';
  return (
    <article className={`vital-card status-border-${status}${selected ? ' vital-selected' : ''}`}>
      <button className="vital-card-button" type="button" onClick={onSelect} aria-label={`${indicator.name}: ${value} ${indicator.unit}; ${STATUS_LABEL[status]}`}>
        <div className="vital-card-title"><span>{indicator.name}</span><span className={`status-label status-${status}`}>{STATUS_LABEL[status]}</span></div>
        <div className="vital-reading"><strong>{value}</strong><span>{indicator.unit}</span></div>
        <div className="vital-range">NORMAL {ranges.ok[0]}–{ranges.ok[1]} {indicator.unit}</div>
        <MiniChart readings={history} status={status} />
        <div className="vital-source">{reading ? <Origen source={reading.source} compact /> : <span className="tag">SIN DATOS</span>}<span>{reading?.quality === 'no_signal' ? 'SIN SEÑAL' : ''}</span></div>
      </button>
    </article>
  );
}
