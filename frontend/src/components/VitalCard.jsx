import { HAZARDS } from '../data/crewData';
import { getRanges, getStatus, STATUS_LABEL } from '../services/health';
import { sourceLabel, sourceTagClass } from '../services/readings';
import Term from './Term';
import './VitalCard.css';

const CHART_COLOR = {
  ok: 'var(--accent)',
  warn: 'var(--warn)',
  crit: 'var(--crit)',
  nodata: 'var(--dim)',
};

function MiniChart({ readings = [], status = 'ok' }) {
  const values = readings
    .filter((r) => r?.quality !== 'no_signal' && r?.value != null && Number.isFinite(Number(r.value)))
    .slice(-18)
    .map((r) => Number(r.value));

  if (values.length < 2) {
    return <div className="mini-chart-empty" aria-label="Sin lecturas suficientes para la gráfica" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${27 - ((v - min) / spread) * 22}`)
    .join(' ');

  return (
    <svg className="mini-chart" viewBox="0 0 100 30" role="img" aria-label="Gráfica miniatura de las últimas lecturas">
      <polyline
        points={points}
        fill="none"
        stroke={CHART_COLOR[status] || CHART_COLOR.ok}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function VitalCard({ indicator, crew, reading, history = [], onSelect, selected = false }) {
  const status = getStatus(indicator, crew, reading);
  const ranges = getRanges(indicator, crew);
  const value = reading?.quality === 'no_signal' ? '—' : reading?.value ?? '—';

  // Lo normal se ve resumido; lo que necesita atención o está seleccionado, completo
  const needsAttention = status === 'warn' || status === 'crit';
  const expanded = selected || needsAttention;
  const detailId = `vc-detail-${indicator.id}`;

  return (
    <article className={`vc vc-${status}${selected ? ' vc-selected' : ''}`}>
      <div className="vc-head-row">
        <button
          className="vc-head"
          type="button"
          onClick={onSelect}
          aria-expanded={expanded}
          aria-controls={detailId}
          aria-label={`${indicator.name}: ${value} ${indicator.unit}; ${STATUS_LABEL[status]}`}
        >
          <span className="vc-top">
            <span className="vc-name">{indicator.name}</span>
            <span className={`vc-status vc-status-${status}`}>
              <i aria-hidden="true" />
              {STATUS_LABEL[status]}
            </span>
          </span>

          <span className="vc-main">
            <span className="vc-reading">
              <strong className="vc-value">{value}</strong>
              <span className="vc-unit">{indicator.unit}</span>
            </span>
            <MiniChart readings={history} status={status} />
          </span>
        </button>
        <Term id={indicator.id} compact />
      </div>

      {expanded && (
        <div className="vc-detail" id={detailId}>
          <div className="vc-range">
            Rango normal: {ranges.ok[0]}–{ranges.ok[1]} {indicator.unit}
          </div>

          {needsAttention && indicator.action && (
            <p className={`vc-action vc-action-${status}`}>
              <b>Qué hacer:</b> {indicator.action}
            </p>
          )}

          {indicator.why && (
            <p className="vc-why">
              <b>En el espacio:</b> {indicator.why}
            </p>
          )}

          {indicator.hazards?.length > 0 && (
            <div className="vc-hazards" aria-label="Peligros de vuelo espacial relacionados">
              {indicator.hazards.map((id) => (
                <span className="vc-hazard" key={id}>{HAZARDS[id] || id}</span>
              ))}
            </div>
          )}

          <div className="vc-source">
            <span className={`tag ${reading ? sourceTagClass(reading.source) : ''}`}>
              {reading ? sourceLabel(reading.source) : 'SIN DATOS'}
            </span>
            {reading?.quality === 'no_signal' && <span className="vc-nosignal">SIN SEÑAL</span>}
          </div>
        </div>
      )}
    </article>
  );
}