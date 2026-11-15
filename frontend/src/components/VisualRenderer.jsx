import { getGlossaryEntry } from '../data/glossary';

function pointOnArc(cx, cy, radius, angle) {
  const radians = (angle * Math.PI) / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

function Gauge({ reading }) {
  if (!reading || reading.value == null) return null;
  const range = reading.rangeWarn || reading.rangeOk;
  const min = range?.[0];
  const max = range?.[1];
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  const ratio = Math.max(0, Math.min(1, (reading.value - min) / (max - min)));
  const angle = 180 + ratio * 180;
  const [x, y] = pointOnArc(100, 100, 76, angle);
  const [startX, startY] = pointOnArc(100, 100, 76, 180);
  const [endX, endY] = pointOnArc(100, 100, 76, 360);
  const color = reading.status === 'crit' ? 'var(--crit)' : reading.status === 'warn' ? 'var(--warn)' : 'var(--accent)';
  return (
    <svg className="assistant-gauge" viewBox="0 0 200 112" role="img" aria-label={`Medidor: ${reading.value} ${reading.unit}, estado ${reading.status}`}>
      <path d={`M ${startX} ${startY} A 76 76 0 0 1 ${endX} ${endY}`} fill="none" stroke="var(--line)" strokeWidth="12" strokeLinecap="round" />
      <path d={`M ${startX} ${startY} A 76 76 0 0 1 ${x} ${y}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
      <circle cx={x} cy={y} r="7" fill={color} />
      <text x="100" y="82" textAnchor="middle" className="assistant-gauge-value">{reading.value} {reading.unit}</text>
      <text x="100" y="102" textAnchor="middle" className="assistant-gauge-range">{min}–{max}</text>
    </svg>
  );
}

function RangeVisual({ reading }) {
  if (!reading || reading.value == null) return <p className="assistant-visual-empty">No hay una lectura disponible para este indicador.</p>;
  const ok = reading.rangeOk;
  const warn = reading.rangeWarn;
  if (!Array.isArray(ok) || !Array.isArray(warn)) return null;
  const min = Math.min(ok[0], warn[0]);
  const max = Math.max(ok[1], warn[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  const position = (value) => `${Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))}%`;
  const okStart = position(ok[0]);
  const okEnd = position(ok[1]);
  const warnStart = position(warn[0]);
  const warnEnd = position(warn[1]);
  return (
    <div className="assistant-range" role="img" aria-label={`Rango de referencia ${ok[0]} a ${ok[1]} ${reading.unit}; lectura actual ${reading.value}`}>
      <div className="assistant-range-bar">
        <i className="range-zone range-zone-warn" style={{ left: warnStart, width: `calc(${okStart} - ${warnStart})` }} />
        <i className="range-zone range-zone-ok" style={{ left: okStart, width: `calc(${okEnd} - ${okStart})` }} />
        <i className="range-zone range-zone-warn" style={{ left: okEnd, width: `calc(${warnEnd} - ${okEnd})` }} />
        <i className="range-marker" style={{ left: position(reading.value) }} />
      </div>
      <div className="assistant-range-labels"><span>{min}</span><strong>{reading.value} {reading.unit} · normal {ok[0]}–{ok[1]}</strong><span>{max}</span></div>
    </div>
  );
}

function TrendVisual({ reading }) {
  const values = reading?.history || [];
  if (values.length < 2) return <p className="assistant-visual-empty">Aún no hay suficientes lecturas para dibujar la tendencia.</p>;
  const low = Math.min(...values);
  const spread = Math.max(...values) - low || 1;
  const points = values.map((value, index) => (
    `${(index / (values.length - 1)) * 280},${60 - ((value - low) / spread) * 50}`
  )).join(' ');
  return (
    <svg className="assistant-trend" viewBox="0 0 280 72" role="img" aria-label={`Tendencia reciente de ${reading.name}, ${values.length} lecturas`}>
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      <text x="0" y="70">{values.length} lecturas</text>
    </svg>
  );
}

function Diagram({ conceptId }) {
  const steps = getGlossaryEntry(conceptId).diagram;
  if (!steps?.length) return null;
  return (
    <ol className="assistant-diagram" aria-label={`Diagrama: ${getGlossaryEntry(conceptId).label}`}>
      {steps.map((step, index) => (
        <li key={step.title} style={{ '--step-index': index }}>
          <span className="assistant-diagram-number">{index + 1}</span>
          <span><strong>{step.title}</strong><small>{step.description}</small></span>
        </li>
      ))}
    </ol>
  );
}

export default function VisualRenderer({ visual, screenContext }) {
  if (!visual || visual.type === 'none') return null;
  const reading = screenContext?.readings?.find((item) => item.indicatorId === visual.indicatorId);
  let content = null;
  if (visual.type === 'range') content = <RangeVisual reading={reading} />;
  if (visual.type === 'gauge') content = <Gauge reading={reading} />;
  if (visual.type === 'trend') content = <TrendVisual reading={reading} />;
  if (visual.type === 'diagram') content = <Diagram conceptId={visual.conceptId} />;
  return content ? <div className="assistant-visual">{content}</div> : null;
}
