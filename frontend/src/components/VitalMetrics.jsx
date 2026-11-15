import { lazy, Suspense, useState } from 'react';
import { getOverallStatus, STATUS_LABEL } from '../services/health';
import { sourceLabel } from '../services/readings';
import VitalCard from './VitalCard';
import HealthAlerts from './HealthAlerts';
import CrewSelector from './CrewSelector';
import VitalsPanel from './VitalsPanel';

const BodyViewer3D = lazy(() => import('./BodyViewer3D'));

export default function VitalMetrics({ data, onSelectIndicator }) {
  const { crew, indicators, activeCrewId, setActiveCrewId, latest, history, alerts } = data;
  const astronaut = crew[activeCrewId];
  const current = latest[activeCrewId] || {};
  const [selected, setSelected] = useState('hr');
  const showFullBodyViewer = false;
  const hasReading = Object.values(current).some((reading) => reading?.quality !== 'no_signal' && reading?.value != null);
  const status = hasReading ? getOverallStatus(astronaut, current) : 'warn';
  const localAlerts = alerts.filter((alert) => alert.crewId === activeCrewId);
  const orderedIndicators = Object.values(indicators);
  const handleSelectIndicator = (indicatorId) => {
    const nextSelected = selected === indicatorId ? '' : indicatorId;
    setSelected(nextSelected);
    onSelectIndicator?.(nextSelected);
  };
  return (
    <div className="page-grid">
      <div className="monitor-toolbar">
        <CrewSelector crew={Object.values(crew)} activeCrewId={activeCrewId} onChange={setActiveCrewId} />
        <div className={`overall-status overall-${status}`}><span className="status-dot" /> ESTADO GENERAL <strong>{STATUS_LABEL[status]}</strong></div>
      </div>
      <section className="monitor-layout" aria-label="Estado de salud del tripulante">
        <div className="monitor-main">
          <div className="vitals-grid">
            {orderedIndicators.map((indicator) => (
              <VitalCard
                key={indicator.id}
                indicator={indicator}
                crew={astronaut}
                reading={current[indicator.id]}
                selected={selected === indicator.id}
                onSelect={() => handleSelectIndicator(indicator.id)}
              />
            ))}
          </div>
          <section className="panel body-panel">
            <div className="panel-heading"><div><span className="eyebrow">MAPA BIOMÉTRICO</span><h2>Telemetría corporal</h2></div><span className="tag">SELECCIONA UN PUNTO</span></div>
            {showFullBodyViewer && <Suspense fallback={<div className="viewer-fallback">Preparando visor holográfico…</div>}><BodyViewer3D crew={astronaut} indicators={indicators} latest={current} selected={selected} onSelect={setSelected} /></Suspense>}
            <VitalsPanel
              selected={selected}
              indicatorData={indicators[selected]}
              crew={astronaut}
              indicators={indicators}
              latest={current}
              history={history[activeCrewId] || {}}
              onSelect={handleSelectIndicator}
            />
          </section>
        </div>
        <aside className="monitor-aside">
          <section className="panel side-panel"><div className="panel-heading"><div><span className="eyebrow">PRIORIDAD</span><h2>Alertas activas</h2></div><span className="count-badge">{localAlerts.length}</span></div><HealthAlerts alerts={localAlerts.slice(0, 4)} crewById={crew} latest={latest} compact /></section>
          <section className="panel side-panel"><div className="panel-heading"><div><span className="eyebrow">TELEMETRÍA</span><h2>Últimos eventos</h2></div></div><div className="event-list">{orderedIndicators.slice(0, 5).map((indicator) => { const reading = current[indicator.id]; return <div className="event-row" key={indicator.id}><span className={`event-marker ${reading?.source === 'simulated' ? 'event-sim' : ''}`} /><span><strong>{indicator.name}</strong><small>{reading?.quality === 'no_signal' ? 'sin señal' : reading?.timestamp ? new Date(Number(reading.timestamp) || reading.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Esperando lectura'}{reading ? ` · ${sourceLabel(reading.source)}` : ''}</small></span><b>{reading?.value ?? '—'} {reading?.value != null ? indicator.unit : ''}</b></div>; })}</div></section>
        </aside>
      </section>
    </div>
  );
}
