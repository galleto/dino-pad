import { getStatus, STATUS_LABEL } from '../services/health';
import './VitalCard.css';

export default function VitalCard({ indicator, crew, reading, onSelect, selected = false }) {
  const status = getStatus(indicator, crew, reading);
  const value = reading?.quality === 'no_signal' ? '—' : reading?.value ?? '—';

  return (
    <article className={`vc vc-${status}${selected ? ' vc-selected' : ''}`}>
      <button
        className="vc-head"
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${indicator.name}: ${value} ${indicator.unit}; ${STATUS_LABEL[status]}${selected ? ', seleccionado' : ', activar para ver el detalle'}`}
      >
        <span className="vc-top">
          <span className="vc-name">{indicator.name}</span>
          <span className={`vc-status vc-status-${status}`}>
            <i aria-hidden="true" />
            {STATUS_LABEL[status]}
          </span>
        </span>
        <span className="vc-reading">
          <strong className="vc-value">{value}</strong>
          <span className="vc-unit">{indicator.unit}</span>
        </span>
      </button>
    </article>
  );
}
