import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { getGlossaryEntry } from '../data/glossary';
import {
  getVitalAssessment,
  SIMULATOR_LIMITS,
  SIMULATOR_NOISE,
  SIMULATOR_SCENARIOS,
  VITALS_CONFIG,
  obtenerSignosVitales,
} from './vitalsConfig';
import './VitalsPanel.css';

const BodyViewer3D = lazy(() => import('./BodyViewer3D'));

function createInitialSimulation() {
  const values = obtenerSignosVitales();
  const history = Object.fromEntries(
    Object.entries(VITALS_CONFIG).map(([id, config]) => {
      const current = values[config.mainKey];
      return [id, Array.from({ length: 30 }, (_, index) => (
        current + Math.sin(index * 0.7) * (Math.abs(current) * 0.015 || 0.1)
      ))];
    }),
  );
  return { values, history };
}

function formatValue(value, digits = 0) {
  return Number(value).toLocaleString('es', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function ReferenceBar({ value, range, status }) {
  const span = range.max - range.min || 1;
  const position = Math.max(0, Math.min(100, ((value - range.min) / span) * 100));
  const start = Math.max(0, Math.min(100, ((range.normal[0] - range.min) / span) * 100));
  const end = Math.max(0, Math.min(100, ((range.normal[1] - range.min) / span) * 100));

  return (
    <div className="vitals-reference">
      <div
        className="vitals-range-track"
        role="img"
        aria-label={`${range.label}; valor ${formatValue(value, 1)}`}
      >
        <span className="vitals-normal-band" style={{ left: `${start}%`, width: `${Math.max(0, end - start)}%` }} />
        <i className={`vitals-range-marker marker-${status}`} style={{ left: `${position}%` }} />
      </div>
      <span>{range.label}</span>
    </div>
  );
}

function TrendChart({ readings, status }) {
  const values = readings.slice(-30);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points = values
    .map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${27 - ((value - min) / spread) * 22}`)
    .join(' ');

  return (
    <svg className="vitals-trend" viewBox="0 0 100 30" role="img" aria-label="Tendencia simulada de las últimas 30 lecturas">
      <polyline
        points={points}
        fill="none"
        stroke={`var(--${status === 'ok' ? 'ok' : status === 'crit' ? 'crit' : 'warn'})`}
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function EcgTrace({ heartRate }) {
  const duration = `${60 / Math.max(30, heartRate)}s`;
  return (
    <div className="vitals-ecg">
      <span>ECG SIMULADO</span>
      <svg viewBox="0 0 100 40" role="img" aria-label={`Trazo de ECG simulado a ${heartRate} latidos por minuto`}>
        <path
          className="vitals-ecg-line"
          style={{ '--ecg-duration': duration }}
          d="M0 20 H8 L11 17 L14 20 H20 L23 20 L27 4 L30 36 L33 17 L36 20 H42 L45 17 L48 20 H54 L57 20 L61 4 L64 36 L67 17 L70 20 H76 L79 17 L82 20 H88 L91 20 L95 4 L98 36 L101 17 L104 20"
        />
      </svg>
    </div>
  );
}

function SimulatorSlider({ slider, unit, value, onChange }) {
  const digits = ['temp', 'sleep', 'mood'].includes(slider.key) ? 1 : 0;
  return (
    <label className="vitals-slider">
      <span>{slider.label} <strong>{formatValue(value, digits)} {unit}</strong></span>
      <input
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={value}
        onChange={(event) => onChange(slider.key, Number(event.target.value))}
      />
    </label>
  );
}

export default function VitalsPanel({
  selected,
  indicatorData,
  crew,
  indicators,
  latest,
  history,
  onSelect,
}) {
  const [simulation, setSimulation] = useState(createInitialSimulation);
  const [scenario, setScenario] = useState('reposo');
  const indicatorId = VITALS_CONFIG[selected] ? selected : 'hr';
  const config = VITALS_CONFIG[indicatorId];
  const values = simulation.values;
  const assessment = useMemo(
    () => getVitalAssessment(indicatorId, values),
    [indicatorId, values],
  );
  const historyForSelected = simulation.history[indicatorId] || history?.[indicatorId] || [];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSimulation((previous) => {
        const targets = SIMULATOR_SCENARIOS[scenario].values;
        const nextValues = { ...previous.values };
        Object.entries(targets).forEach(([key, target]) => {
          const [minimum, maximum] = SIMULATOR_LIMITS[key];
          const drift = (target - previous.values[key]) * 0.12;
          const noise = (Math.random() - 0.5) * SIMULATOR_NOISE[key];
          const digits = ['temp', 'sleep', 'mood'].includes(key) ? 1 : 0;
          nextValues[key] = Number(Math.max(minimum, Math.min(maximum, previous.values[key] + drift + noise)).toFixed(digits));
        });
        const nextHistory = { ...previous.history };
        Object.entries(VITALS_CONFIG).forEach(([id, item]) => {
          nextHistory[id] = [...(previous.history[id] || []), nextValues[item.mainKey]].slice(-30);
        });
        return { values: nextValues, history: nextHistory };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [scenario]);

  const updateValue = (key, value) => {
    const [minimum, maximum] = SIMULATOR_LIMITS[key];
    const digits = ['temp', 'sleep', 'mood'].includes(key) ? 1 : 0;
    const nextValue = Number(Math.max(minimum, Math.min(maximum, value)).toFixed(digits));
    setSimulation((previous) => ({
      ...previous,
      values: { ...previous.values, [key]: nextValue },
    }));
  };

  const mainValue = indicatorId === 'bp'
    ? `${formatValue(values.bp)}/${formatValue(values.bpDia)}`
    : formatValue(values[config.mainKey], ['temp', 'sleep', 'mood'].includes(config.mainKey) ? 1 : 0);
  const secondaryValue = indicatorId === 'bp'
    ? `${formatValue(values.bp)} sistólica · ${formatValue(values.bpDia)} diastólica`
    : indicatorId === 'spo2'
      ? `${formatValue(values.resp)} resp/min`
      : '';
  const rangeValue = indicatorId === 'bp' ? values.bp : values[config.mainKey];
  const selectedScenario = SIMULATOR_SCENARIOS[scenario];
  const glossary = getGlossaryEntry(indicatorId);

  if (!selected || !VITALS_CONFIG[selected]) {
    return (
      <section className="vitals-panel vitals-panel-empty" aria-label="Detalle de indicadores">
        <p>Selecciona un indicador para ver su detalle y órgano.</p>
      </section>
    );
  }

  return (
    <section className="vitals-panel" aria-label={`Indicador ${indicatorData?.name || config.name}`}>
      <div className="vitals-main-layout">
        <div className="vitals-organ-column">
          <div className="vitals-organ-heading">
            <span className="eyebrow">MODELO ANATÓMICO</span>
            <strong>Cuerpo completo · {config.organLabel}</strong>
          </div>
          <Suspense fallback={<div className="viewer-fallback">Cargando cuerpo 3D…</div>}>
            <BodyViewer3D
              crew={crew}
              indicators={indicators}
              latest={latest}
              selected={selected}
              onSelect={onSelect}
            />
          </Suspense>
        </div>

        <div className="vitals-readout">
          <div className="vitals-readout-heading">
            <div>
              <span className="eyebrow">{config.name.toUpperCase()}</span>
              <h3>{indicatorData?.name || config.name}</h3>
            </div>
            <span className={`vitals-badge status-${assessment.status}`}>{assessment.term}</span>
          </div>
          <div className="vitals-current-value">
            <strong>{mainValue}</strong>
            <span>{config.unit}</span>
          </div>
          {indicatorId === 'hr' && <EcgTrace heartRate={values.hr} />}
          {secondaryValue && <p className="vitals-secondary-value">{secondaryValue}</p>}
          {indicatorId === 'bp' && (
            <p className="vitals-reference-copy">Normal: &lt;120/80 mmHg</p>
          )}
          {indicatorId === 'spo2' && (
            <ReferenceBar value={values.resp} range={config.secondaryRange} status={assessment.status} />
          )}
          <ReferenceBar value={rangeValue} range={config.range} status={assessment.status} />
          {indicatorId === 'bp' && (
            <ReferenceBar value={values.bpDia} range={config.secondaryRange} status={assessment.status} />
          )}
          {(assessment.status === 'warn' || assessment.status === 'crit') && (
            <div className={`vitals-warning status-${assessment.status}`} role="alert">
              <strong>{assessment.term}</strong>
              <span>{assessment.meaning}</span>
            </div>
          )}
          <div className="vitals-action">
            <strong>Qué hacer</strong>
            <p>{indicatorData?.action || assessment.recommendation}</p>
            {indicatorData?.action && <small>Simulación: {assessment.recommendation}</small>}
          </div>
          <details className="vitals-explanation">
            <summary>¿Qué significa {glossary.label}?</summary>
            <p>{glossary.definition}</p>
            {indicatorData?.why && <p><strong>En la misión:</strong> {indicatorData.why}</p>}
          </details>
          <div className="vitals-trend-heading">
            <span>TENDENCIA · ÚLTIMAS 30 LECTURAS</span>
            <small>simulada</small>
          </div>
          <TrendChart readings={historyForSelected} status={assessment.status} />
        </div>
      </div>

      <div className="vitals-simulator">
        <div className="vitals-simulator-heading">
          <div><span className="eyebrow">SIMULADOR LOCAL</span><strong>Prueba de escenarios</strong></div>
          <span>{selectedScenario.name}</span>
        </div>
        <div className="vitals-scenario-buttons" role="group" aria-label="Escenario de simulación">
          {Object.entries(SIMULATOR_SCENARIOS).map(([id, item]) => (
            <button
              key={id}
              type="button"
              className={scenario === id ? 'selected' : ''}
              onClick={() => setScenario(id)}
              aria-pressed={scenario === id}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="vitals-slider-grid">
          {Object.values(VITALS_CONFIG).map((item) => (
            <div className="vitals-indicator-controls" key={item.mainKey}>
              <span>{item.name}</span>
              <SimulatorSlider slider={item.slider} unit={item.unit} value={values[item.slider.key]} onChange={updateValue} />
              {item.secondarySlider && (
                <SimulatorSlider
                  slider={item.secondarySlider}
                  unit={item.secondarySlider.unit}
                  value={values[item.secondarySlider.key]}
                  onChange={updateValue}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="vitals-disclaimer">Valores simulados. No es un dispositivo médico.</p>
    </section>
  );
}
