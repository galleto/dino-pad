import { lazy, Suspense, useState } from 'react';
import { getOverallStatus, STATUS_LABEL } from '../services/health';
import Origen from './Origen';
import VitalCard from './VitalCard';
import HealthAlerts from './HealthAlerts';
import CrewSelector from './CrewSelector';
import FiguraHumana from './FiguraHumana';

// El visor 3D (three.js) es opcional y solo se descarga al pedir "Vista 3D".
const BodyViewer3D = lazy(() => import('./BodyViewer3D'));

export default function VitalMetrics({ data, onSelectIndicator }) {
  const { crew, indicators, activeCrewId, setActiveCrewId, latest, history, alerts } = data;
  const astronaut = crew[activeCrewId];
  const current = latest[activeCrewId] || {};
  const [selected, setSelected] = useState('');
  const [vista, setVista] = useState('figura');
  const hasReading = Object.values(current).some((reading) => reading?.quality !== 'no_signal' && reading?.value != null);
  const status = hasReading ? getOverallStatus(astronaut, current) : 'warn';
  const localAlerts = alerts.filter((alert) => alert.crewId === activeCrewId);
  const orderedIndicators = Object.values(indicators);
  const seleccionado = indicators[selected];
  const elegir = (id) => { setSelected(id); onSelectIndicator?.(id); };
  return (
    <div className="monitor">
      <div className="monitor-toolbar">
        <CrewSelector crew={Object.values(crew)} activeCrewId={activeCrewId} onChange={setActiveCrewId} />
        <div className={`overall-status overall-${status} st-${status}`}><span className="overall-label">ESTADO GENERAL</span><strong className="st-glyph">{STATUS_LABEL[status]}</strong></div>
      </div>
      <section className="monitor-layout" aria-label="Estado de salud del tripulante">
        <div className="monitor-canales">
          <header className="col-head"><h2>Indicadores</h2><span>{orderedIndicators.length} canales · rangos del proyecto, no de la NASA</span></header>
          {orderedIndicators.map((indicator) => (
            <VitalCard key={indicator.id} indicator={indicator} crew={astronaut} reading={current[indicator.id]} history={history[activeCrewId]?.[indicator.id] || []} selected={selected === indicator.id} onSelect={() => elegir(indicator.id)} />
          ))}
        </div>
        <section className="monitor-figura body-panel">
          <header className="col-head">
            <h2>Telemetría corporal <small>mapa biométrico</small></h2>
            <div className="vista-toggle" role="group" aria-label="Tipo de vista del cuerpo">
              <button type="button" aria-pressed={vista === 'figura'} onClick={() => setVista('figura')}>Figura</button>
              <button type="button" aria-pressed={vista === '3d'} onClick={() => setVista('3d')}>Vista 3D</button>
            </div>
          </header>
          {vista === 'figura'
            ? <FiguraHumana crew={astronaut} indicators={indicators} latest={current} selected={selected} onSelect={elegir} />
            : <Suspense fallback={<div className="viewer-fallback">Preparando visor holográfico…</div>}><BodyViewer3D crew={astronaut} indicators={indicators} latest={current} selected={selected} onSelect={elegir} /></Suspense>}
          <p className="figura-pie" role="status">{seleccionado ? <><strong>{seleccionado.name}.</strong> {seleccionado.what}</> : 'Selecciona un punto: toca una zona del cuerpo o un indicador.'}</p>
        </section>
        <aside className="monitor-aside">
          <section className="side-panel">
            <header className="col-head"><h2>Alertas activas <small>prioridad</small></h2><span className="count-badge">{localAlerts.length}</span></header>
            <HealthAlerts alerts={localAlerts.slice(0, 4)} crewById={crew} latest={latest} compact />
          </section>
          <section className="side-panel">
            <header className="col-head"><h2>Últimos eventos <small>telemetría</small></h2></header>
            <div className="event-list">{orderedIndicators.slice(0, 5).map((indicator) => { const reading = current[indicator.id]; return <div className="event-row" key={indicator.id}><time>{reading?.quality === 'no_signal' ? 'sin señal' : reading?.timestamp ? new Date(Number(reading.timestamp) || reading.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Esperando lectura'}</time><strong>{indicator.name}</strong><b>{reading?.value ?? '—'} {reading?.value != null ? indicator.unit : ''}</b>{reading ? <Origen source={reading.source} compact /> : <span />}</div>; })}</div>
          </section>
        </aside>
      </section>
    </div>
  );
}
