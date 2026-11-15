import { useEffect, useMemo, useState } from 'react';
import { HAZARDS } from '../data/crewData';
import { useConnection } from '../hooks/useConnection';
import { useVitals } from '../hooks/useVitals';
import { getRanges, buildAlerts } from '../services/health';
import { speakAlert, supportsSpeech } from '../services/speech';
import { sourceLabel } from '../services/readings';
import { api } from '../services/api';
import HealthAlerts from './HealthAlerts';
import VitalMetrics from './VitalMetrics';

function usePageData() {
  const data = useConnection();
  const allAlerts = useMemo(() => {
    const derived = Object.values(data.crew).flatMap((person) => buildAlerts(person, data.latest[person.id] || {}));
    const merged = [...data.alerts];
    derived.forEach((alert) => {
      if (!merged.some((item) => item.crewId === alert.crewId && item.indicatorId === alert.indicatorId && item.level === alert.level)) merged.push(alert);
    });
    const priority = { critical: 0, warning: 1, info: 2 };
    return merged.sort((a, b) => (priority[a.level] ?? 3) - (priority[b.level] ?? 3) || Number(b.timestamp || 0) - Number(a.timestamp || 0));
  }, [data.crew, data.latest, data.alerts]);
  return { ...data, alerts: allAlerts };
}

export function MonitorPage() {
  const data = usePageData();
  return <VitalMetrics data={data} />;
}

export function AlertsPage() {
  const data = usePageData();
  const [level, setLevel] = useState('all');
  const [crewFilter, setCrewFilter] = useState(data.activeCrewId);
  const voiceSupported = supportsSpeech();
  const shownAlerts = useMemo(() => data.alerts.filter((alert) => (level === 'all' || alert.level === level) && (crewFilter === 'all' || alert.crewId === crewFilter)), [data.alerts, level, crewFilter]);

  return (
    <div className="page-grid">
      <div className="section-heading"><div><span className="eyebrow">CENTRO DE INCIDENTES</span><h2>Alertas de salud</h2><p>Prioridad, contexto y respuesta sugerida para la tripulación.</p></div><span className="tag">{shownAlerts.length} REGISTROS</span></div>
      <section className="panel alert-controls" aria-label="Filtros de alertas">
        <label>Nivel<select value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">Todos</option><option value="critical">Críticas</option><option value="warning">Atención</option><option value="info">Informativas</option></select></label>
        <label>Tripulante<select value={crewFilter} onChange={(event) => setCrewFilter(event.target.value)}><option value="all">Toda la tripulación</option>{Object.values(data.crew).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        {voiceSupported && <label className="voice-toggle"><input type="checkbox" checked={data.readCriticalVoice} onChange={(event) => data.setReadCriticalVoice(event.target.checked)} /> Leer alertas críticas en voz alta</label>}
      </section>
      <HealthAlerts alerts={shownAlerts} crewById={data.crew} latest={data.latest} voiceSupported={voiceSupported} onSpeak={speakAlert} />
    </div>
  );
}

function timestampValue(reading) {
  const timestamp = reading?.timestamp;
  if (typeof timestamp === 'number') return timestamp;
  const numeric = Number(timestamp);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.parse(timestamp) || 0;
}

function HistoryChart({ readings, indicator, crew }) {
  const [hovered, setHovered] = useState(null);
  const valid = readings.filter((reading) => reading?.quality !== 'no_signal' && reading?.value != null && Number.isFinite(Number(reading.value)));
  if (valid.length < 2) return <div className="empty-state">No hay suficientes lecturas válidas para graficar.</div>;
  const range = getRanges(indicator, crew).ok;
  const baseline = crew.baseline?.[indicator.id];
  const allValues = [...valid.map((reading) => Number(reading.value)), ...range, ...(Number.isFinite(baseline) ? [baseline] : [])];
  const low = Math.min(...allValues);
  const high = Math.max(...allValues);
  const padding = Math.max((high - low) * .14, .2);
  const min = low - padding;
  const max = high + padding;
  const x = (index) => 44 + (index / Math.max(valid.length - 1, 1)) * 820;
  const y = (value) => 208 - ((value - min) / (max - min)) * 170;
  const points = valid.map((reading, index) => `${x(index)},${y(Number(reading.value))}`).join(' ');
  const bandTop = y(range[1]);
  const bandBottom = y(range[0]);
  return (
    <div className="history-graph-wrap">
      <svg className="history-graph" viewBox="0 0 900 250" role="img" aria-label={`Historial de ${indicator.name}; banda de rango normal y línea base`}>
        <rect x="44" y={bandTop} width="820" height={Math.max(bandBottom - bandTop, 1)} fill="#a4ff7010" />
        <line x1="44" x2="864" y1={bandTop} y2={bandTop} stroke="#4a7142" strokeDasharray="4 5" />
        <line x1="44" x2="864" y1={bandBottom} y2={bandBottom} stroke="#4a7142" strokeDasharray="4 5" />
        {Number.isFinite(baseline) && <line x1="44" x2="864" y1={y(baseline)} y2={y(baseline)} stroke="#ffc66d" strokeDasharray="7 5" />}
        <polyline points={points} fill="none" stroke="#a4ff70" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {valid.map((reading, index) => <circle key={`${timestampValue(reading)}-${index}`} cx={x(index)} cy={y(Number(reading.value))} r={hovered === index ? 5 : 2.5} fill={hovered === index ? '#ffc66d' : '#a4ff70'} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} tabIndex="0" aria-label={`${Number(reading.value)} ${indicator.unit} · ${sourceLabel(reading.source)} · ${new Date(timestampValue(reading)).toLocaleString('es')}`}><title>{Number(reading.value)} {indicator.unit} · {sourceLabel(reading.source)} · {new Date(timestampValue(reading)).toLocaleString('es')}</title></circle>)}
        <text x="44" y="238" className="axis-label">{new Date(timestampValue(valid[0])).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</text>
        <text x="864" y="238" textAnchor="end" className="axis-label">{new Date(timestampValue(valid.at(-1))).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</text>
        <text x="8" y={bandTop + 4} className="axis-label">{range[1]}</text><text x="8" y={bandBottom + 4} className="axis-label">{range[0]}</text>
      </svg>
      {hovered !== null && valid[hovered] && <div className="chart-tooltip" role="status">{Number(valid[hovered].value)} {indicator.unit} · {sourceLabel(valid[hovered].source)} · {new Date(timestampValue(valid[hovered])).toLocaleString('es')}</div>}
      <div className="chart-legend"><span><i className="legend-range" /> Rango normal</span>{Number.isFinite(baseline) && <span><i className="legend-baseline" /> Línea base personal ({baseline} {indicator.unit})</span>}<span><i className="legend-reading" /> Lecturas</span></div>
    </div>
  );
}

export function HistoryPage() {
  const data = usePageData();
  const { indicators, activeCrewId, setActiveCrewId, crew, history, connectionState } = data;
  const [indicatorId, setIndicatorId] = useState(Object.keys(indicators)[0] || 'hr');
  const [limit, setLimit] = useState(60);
  const [remoteRows, setRemoteRows] = useState({ key: '', rows: null });
  const [error, setError] = useState({ key: '', message: '' });
  const indicator = indicators[indicatorId] || Object.values(indicators)[0];
  const person = crew[activeCrewId];
  const requestKey = `${activeCrewId}:${indicatorId}:${limit}:${connectionState}`;
  useEffect(() => {
    if (connectionState !== 'live') return undefined;
    const controller = new AbortController();
    api.history(activeCrewId, indicatorId, limit, controller.signal).then((rows) => {
      if (!Array.isArray(rows)) throw new Error('El historial recibido no tiene el formato esperado.');
      setRemoteRows({ key: requestKey, rows: rows.map((row) => ({ ...row, crewId: activeCrewId, indicatorId, source: row.source || 'unknown' })) });
      setError({ key: requestKey, message: '' });
    }).catch((requestError) => {
      if (requestError.name !== 'AbortError') setError({ key: requestKey, message: 'No se pudo cargar el historial remoto; se muestran lecturas disponibles en caché.' });
    });
    return () => controller.abort();
  }, [activeCrewId, indicatorId, limit, connectionState, requestKey]);
  const readings = ((remoteRows.key === requestKey ? remoteRows.rows : null) || history[activeCrewId]?.[indicatorId] || []).slice(-limit);
  return (
    <div className="page-grid">
      <div className="section-heading"><div><span className="eyebrow">SERIE TEMPORAL</span><h2>Historial biométrico</h2><p>Lecturas, rango normal y referencia personal del tripulante.</p></div><span className="tag">{readings.length} PUNTOS</span></div>
      <section className="panel history-panel">
        <div className="history-controls toolbar">
          <label>Tripulante<select value={activeCrewId} onChange={(event) => setActiveCrewId(event.target.value)}>{Object.values(crew).map((personEntry) => <option key={personEntry.id} value={personEntry.id}>{personEntry.name}</option>)}</select></label>
          <label>Indicador<select value={indicatorId} onChange={(event) => setIndicatorId(event.target.value)}>{Object.values(indicators).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Cantidad<select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>{[30, 60, 100, 200, 500].map((amount) => <option key={amount} value={amount}>{amount} lecturas</option>)}</select></label>
          <span className="tag">{connectionState === 'live' ? 'EN VIVO' : 'DATOS DISPONIBLES'}</span>
        </div>
        {error.key === requestKey && error.message && <p className="inline-error" role="status">{error.message}</p>}
        {indicator && person ? <HistoryChart readings={readings} indicator={indicator} crew={person} /> : <div className="empty-state">Faltan datos de tripulación o indicador.</div>}
        <div className="history-summary"><span>Última lectura <strong>{readings.at(-1)?.value ?? '—'} {readings.length ? `${indicator?.unit} · ${sourceLabel(readings.at(-1)?.source)}` : ''}</strong></span><span>Actualizado <strong>{readings.at(-1) ? new Date(timestampValue(readings.at(-1))).toLocaleString('es') : 'Sin datos'}</strong></span></div>
      </section>
    </div>
  );
}

function regression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, r2: 0, deviation: 0 };
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  const slope = denominator ? numerator / denominator : 0;
  const residual = values.reduce((sum, value, index) => sum + (value - (yMean + slope * (index - xMean))) ** 2, 0);
  const total = values.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const variance = total / n;
  return { slope, r2: total ? Math.max(0, 1 - residual / total) : 0, deviation: Math.sqrt(variance) };
}

function correlation(left, right) {
  const length = Math.min(left.length, right.length);
  if (length < 8) return null;
  const xs = left.slice(-length);
  const ys = right.slice(-length);
  const xMean = xs.reduce((sum, value) => sum + value, 0) / length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / length;
  const covariance = xs.reduce((sum, value, index) => sum + (value - xMean) * (ys[index] - yMean), 0);
  const xSpread = Math.sqrt(xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0));
  const ySpread = Math.sqrt(ys.reduce((sum, value) => sum + (value - yMean) ** 2, 0));
  return xSpread && ySpread ? covariance / (xSpread * ySpread) : null;
}

export function TrendsPage() {
  const data = usePageData();
  const [indicatorId, setIndicatorId] = useState(Object.keys(data.indicators)[0] || 'hr');
  const indicator = data.indicators[indicatorId];
  const cards = Object.values(data.crew).map((person) => {
    const validReadings = (data.history[person.id]?.[indicatorId] || []).filter((reading) => reading?.quality !== 'no_signal' && reading?.value != null && Number.isFinite(Number(reading.value))).slice(-60);
    const valid = validReadings.map((reading) => Number(reading.value));
    const fit = regression(valid);
    const baseline = Number(person.baseline?.[indicatorId]);
    const change = valid.length > 1 ? fit.slope * (valid.length - 1) : 0;
    const threshold = Math.max(Math.abs(baseline || 1) * .01, fit.deviation * .25);
    const direction = valid.length < 4 || Math.abs(change) < threshold ? 'estable' : change > 0 ? 'subiendo' : 'bajando';
    const confidence = valid.length >= 40 && fit.r2 >= .55 ? 'alta' : valid.length >= 20 && fit.r2 >= .3 ? 'media' : 'baja';
    return { person, valid, source: validReadings.at(-1)?.source, fit, baseline, change, direction, confidence };
  });
  const relationRows = useMemo(() => {
    const crewId = data.activeCrewId;
    const main = (data.history[crewId]?.[indicatorId] || []).filter((reading) => reading.quality !== 'no_signal' && reading.value != null && Number.isFinite(Number(reading.value))).slice(-60);
    return Object.values(data.indicators).filter((other) => other.id !== indicatorId).map((other) => {
      const peer = (data.history[crewId]?.[other.id] || []).filter((reading) => reading.quality !== 'no_signal' && reading.value != null && Number.isFinite(Number(reading.value))).slice(-60);
      const left = [];
      const right = [];
      main.forEach((reading) => {
        const time = timestampValue(reading);
        if (!time) return;
        const closest = peer.reduce((best, candidate) => Math.abs(timestampValue(candidate) - time) < Math.abs(timestampValue(best) - time) ? candidate : best, null);
        if (closest && timestampValue(closest) && Math.abs(timestampValue(closest) - time) < 300000) {
          left.push(Number(reading.value));
          right.push(Number(closest.value));
        }
      });
      return { other, count: left.length, value: correlation(left, right) };
    }).filter((row) => row.value !== null).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3);
  }, [data.history, data.activeCrewId, data.indicators, indicatorId]);
  return (
    <div className="page-grid">
      <div className="section-heading"><div><span className="eyebrow">ANÁLISIS DE CAMBIO</span><h2>Tendencias de la tripulación</h2><p>Regresión lineal sobre hasta 60 lecturas válidas; no es una predicción clínica.</p></div><label className="compact-field">Indicador<select value={indicatorId} onChange={(event) => setIndicatorId(event.target.value)}>{Object.values(data.indicators).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <div className="trend-grid">{cards.map(({ person, valid, source, baseline, change, direction, confidence }) => <article className="panel trend-card" key={person.id}><div className="trend-card-head"><span className="crew-initial">{person.name.slice(0, 1)}</span><div><h3>{person.name}</h3><small>{person.role}</small></div><span className={`trend-direction trend-${direction}`}>{direction.toUpperCase()}</span></div><div className="trend-value">{valid.at(-1) ?? '—'} <small>{indicator?.unit || ''} · {sourceLabel(source)}</small></div><p>{valid.length < 4 ? 'Aún no hay suficientes lecturas consecutivas para estimar una tendencia.' : direction === 'estable' ? 'La pendiente reciente no muestra un cambio progresivo claro frente a su variabilidad.' : `La regresión estima un cambio de ${change > 0 ? '+' : ''}${change.toFixed(2)} ${indicator?.unit || ''} en ${valid.length} lecturas.`}</p><div className="trend-meta"><span>BASE PERSONAL <strong>{Number.isFinite(baseline) ? baseline : '—'}</strong></span><span>CONFIANZA <strong>{confidence.toUpperCase()}</strong></span><span>LECTURAS <strong>{valid.length}</strong></span></div><div className="confidence-track"><i style={{ width: `${confidence === 'alta' ? 100 : confidence === 'media' ? 65 : 30}%` }} /></div></article>)}</div>
      <section className="panel relation-panel"><div className="panel-heading"><div><span className="eyebrow">ASOCIACIÓN EXPLORATORIA</span><h2>Relaciones observadas · {data.crew[data.activeCrewId]?.name || 'Tripulación'}</h2></div><span className="tag">NO IMPLICA CAUSALIDAD</span></div>{relationRows.length ? <div className="relation-list">{relationRows.map((row) => <div key={row.other.id}><span>{indicator?.name} ↔ {row.other.name}</span><strong>{row.value > 0 ? '+' : ''}{row.value.toFixed(2)}</strong><small>r de Pearson · {row.count} pares por cercanía temporal</small></div>)}</div> : <div className="empty-state">No hay suficientes lecturas emparejadas en el tiempo para estimar correlaciones. Se requieren al menos 8 pares válidos.</div>}</section>
    </div>
  );
}

export function CrewPage() {
  const data = usePageData();
  const people = Object.values(data.crew);
  return (
    <div className="page-grid">
      <div className="section-heading"><div><span className="eyebrow">PERSONAL DE MISIÓN</span><h2>Tripulación</h2><p>Perfiles y referencias individuales; la línea base es informativa.</p></div><span className="tag">{people.length} MIEMBROS</span></div>
      {people.length ? <div className="crew-profile-grid">{people.map((person) => {
        const values = Object.values(data.indicators);
        const focusLabels = (person.focus || []).map((id) => data.indicators[id]?.name || id);
        const hazardIds = [...new Set((person.focus || []).flatMap((id) => data.indicators[id]?.hazards || []))];
        const hazardLabels = hazardIds.map((id) => HAZARDS[id] || id);
        return <article className="panel crew-profile" key={person.id}><header><span className="crew-initial crew-profile-initial">{person.name?.slice(0, 1)}</span><div><h3>{person.name}</h3><span>{person.role}</span></div><button className={`button ${data.activeCrewId === person.id ? 'button-primary' : ''}`} onClick={() => data.setActiveCrewId(person.id)} aria-pressed={data.activeCrewId === person.id}>{data.activeCrewId === person.id ? 'ACTIVO' : 'Ver en monitoreo'}</button></header><p className="crew-mission">{person.mission || 'Sin descripción de misión.'}</p><div className="crew-baselines"><h4>Línea base individual</h4>{values.map((item) => { const ranges = getRanges(item, person); return <div key={item.id}><span>{item.name}</span><b>{person.baseline?.[item.id] ?? '—'} <small>{item.unit}</small></b><small>Rango {ranges.ok[0]}–{ranges.ok[1]}</small></div>; })}</div><div className="crew-profile-footer"><span>RIESGOS ENFOCADOS: {hazardLabels.length ? hazardLabels.join(' · ') : focusLabels.join(' · ') || 'No especificados'}</span><span>{person.accent ? <i style={{ backgroundColor: person.accent }} /> : null} ID {person.id}</span></div></article>;
      })}</div> : <div className="empty-state">No se recibieron perfiles de tripulación.</div>}
    </div>
  );
}

const NASA_RISKS = [
  ['Cardiovascular', 'Redistribución de fluidos y carga cardiovascular', ['hr', 'bp']],
  ['Sueño', 'Ritmos de descanso y duración del sueño', ['sleep']],
  ['Salud mental', 'Autorreporte de ánimo y cambios sostenidos', ['mood']],
  ['Respiratorio', 'Oxigenación periférica (SpO₂)', ['spo2']],
  ['Metabólico', 'Glucosa y posibles cambios metabólicos', ['glu']],
  ['Termorregulación', 'Temperatura corporal estimada', ['temp']],
];

export function RisksPage() {
  const { indicators } = usePageData();
  return (
    <div className="page-grid">
      <div className="validation-banner"><strong>CONTENIDO A VALIDAR CON FUENTES OFICIALES</strong><span>Resumen educativo; no sustituye protocolos médicos ni evaluación de la misión.</span></div>
      <div className="section-heading"><div><span className="eyebrow">FACTORES DE VUELO ESPACIAL</span><h2>Riesgos NASA</h2><p>Relación conceptual entre riesgos de misión e indicadores del prototipo.</p></div></div>
      <section className="panel risk-table-wrap"><table className="risk-table"><thead><tr><th>Riesgo</th><th>Qué se monitorea</th><th>Cobertura Dinopad</th></tr></thead><tbody>{NASA_RISKS.map(([risk, measure, ids]) => <tr key={risk}><th scope="row">{risk}</th><td>{measure}</td><td>{ids.map((id) => <span className="tag risk-tag" key={id}>{indicators[id]?.name || id} · {id}</span>)}</td></tr>)}</tbody></table></section>
      <div className="risk-info-grid">
        <section className="panel risk-info"><span className="eyebrow">CONTEXTO OPERATIVO</span><h3>El entorno espacial</h3><p>Las misiones pueden implicar microgravedad, exposición a radiación, aislamiento y confinamiento, retraso de comunicación con la Tierra y recursos médicos limitados. La combinación de factores y los protocolos varían según la misión.</p></section>
        <section className="panel risk-info"><span className="eyebrow">PROPUESTA</span><h3>Más que una lectura aislada</h3><p>Dinopad organiza varias señales por tripulante, las compara con rangos y líneas base, conserva datos localmente ante cortes y prioriza alertas para apoyar la revisión del equipo. No interpreta por sí solo un diagnóstico ni reemplaza la comunicación médica.</p></section>
        <section className="panel risk-info"><span className="eyebrow">LIMITACIONES</span><h3>Prototipo en validación</h3><p>La simulación no representa necesariamente fisiología real. Sensores, calidad, contexto de actividad y datos faltantes afectan la interpretación. Un indicador aislado no confirma ni descarta una condición de salud.</p></section>
      </div>
      <section className="panel risk-sources"><h3>Fuentes de referencia por validar</h3><p>NASA Human Research Program · Agencia Espacial Canadiense</p></section>
    </div>
  );
}

export function EmergencyPage() {
  const data = usePageData();
  const sosAlerts = data.alerts.filter((alert) => /sos/i.test(`${alert.title || ''} ${alert.action || ''}`));
  const currentSos = sosAlerts.find((alert) => alert.id !== data.acknowledgedSos);
  const deviceStatus = data.latest[data.activeCrewId]?.device || {};
  return (
    <div className="page-grid">
      <div className="section-heading"><div><span className="eyebrow">PROTOCOLO DE RESPUESTA</span><h2>Emergencia</h2><p>Estado del SOS, registro de avisos y telemetría del dispositivo.</p></div><span className={`tag ${currentSos ? 'tag-danger' : 'tag-live'}`}>{currentSos ? 'SOS ACTIVO' : 'SIN SOS ACTIVO'}</span></div>
      <section className={`sos-status-panel${currentSos ? ' sos-active' : ''}`} role={currentSos ? 'alert' : 'status'}><span className="sos-icon">SOS</span><div><span className="eyebrow">ESTADO DEL DISPOSITIVO</span><h3>{currentSos ? 'Solicitud de ayuda activa' : 'No hay una solicitud SOS activa'}</h3><p>{currentSos?.message || 'Cuando el backend reciba una alerta SOS, aparecerá aquí y en la barra superior.'}</p></div><button className="button button-danger sos-ack" disabled={!currentSos} onClick={() => currentSos && data.acknowledgeSos(currentSos.id)}>Reconocer SOS</button></section>
      <div className="emergency-grid">
        <section className="panel emergency-panel"><div className="panel-heading"><div><span className="eyebrow">REGISTRO</span><h2>Historial de SOS</h2></div><span className="tag">{sosAlerts.length} EVENTOS</span></div>{sosAlerts.length ? <div className="sos-history">{sosAlerts.map((alert) => <div key={alert.id}><span className={`sos-history-mark ${alert.id === data.acknowledgedSos ? 'acknowledged' : ''}`} /><div><strong>{alert.title || 'SOS recibido'}</strong><p>{alert.message || 'Sin mensaje adicional'}</p><small>{alert.timestamp ? new Date(Number(alert.timestamp) || alert.timestamp).toLocaleString('es') : 'Hora no disponible'} · {alert.id === data.acknowledgedSos ? 'Reconocido' : 'Pendiente de reconocimiento'}</small></div></div>)}</div> : <div className="empty-state">No se han recibido solicitudes SOS.</div>}</section>
        <section className="panel emergency-panel"><div className="panel-heading"><div><span className="eyebrow">TELEMETRÍA DEL DISPOSITIVO</span><h2>Estado del wearable</h2></div></div><div className="device-stat"><span>Batería</span><strong>{deviceStatus.battery != null ? `${deviceStatus.battery}%` : 'Sin datos'}</strong></div><div className="device-stat"><span>Señal RSSI</span><strong>{deviceStatus.rssi != null ? `${deviceStatus.rssi} dBm` : 'Sin datos'}</strong></div><p className="muted device-note">El backend actual no publica una ruta REST de estado del dispositivo ni estos campos en las lecturas recibidas.</p></section>
      </div>
    </div>
  );
}

export function LabPage() {
  const data = usePageData();
  const indicators = Object.values(data.indicators);
  const readings = indicators.map((indicator) => data.latest[data.activeCrewId]?.[indicator.id]).filter(Boolean);
  const measured = data.alerts.filter((alert) => alert._receivedAt && alert.indicatorId).map((alert) => {
    const reading = data.latest[alert.crewId]?.[alert.indicatorId];
    const readAt = timestampValue(reading);
    return readAt > 0 && alert._receivedAt >= readAt ? alert._receivedAt - readAt : null;
  }).filter((value) => value !== null);
  const latency = measured.length ? Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length) : null;
  return (
    <div className="page-grid">
      <div className="section-heading"><div><span className="eyebrow">TRANSPARENCIA Y VALIDACIÓN</span><h2>Laboratorio</h2><p>Entorno de demostración; revisa el origen de cada lectura y sus límites.</p></div><span className={`tag ${data.connectionState === 'live' ? 'tag-live' : 'tag-simulated'}`}>{data.connectionState === 'live' ? 'DATOS DE BACKEND' : data.connectionState === 'offline' ? 'SIN ENLACE' : 'SIMULADOR LOCAL'}</span></div>
      <section className="panel lab-panel"><div className="panel-heading"><div><span className="eyebrow">ESCENARIOS SINTÉTICOS</span><h2>Activar escenario</h2></div><span className="tag tag-simulated">NO ES TELEMETRÍA REAL</span></div><p className="lab-copy">Los perfiles y las lecturas sintéticas se derivan de los datos de demostración del proyecto. Los escenarios solo afectan al simulador local.</p><div className="scenario-grid">{Object.values(data.scenarios).map((scenario) => <button key={scenario.id} className={`scenario-button${data.scenario === scenario.id ? ' selected' : ''}`} onClick={() => data.setScenario(scenario.id)} aria-pressed={data.scenario === scenario.id}><strong>{scenario.name}</strong><small>{Object.keys(scenario.effects || {}).length ? `${Object.keys(scenario.effects).length} indicadores con efectos` : 'Sin perturbaciones añadidas'}</small></button>)}</div><p className="scenario-active">ESCENARIO SELECCIONADO: <strong>{data.scenarios[data.scenario]?.name || 'Día normal'}</strong></p></section>
      <section className="panel lab-panel"><div className="panel-heading"><div><span className="eyebrow">RESILIENCIA</span><h2>Prueba de pérdida de enlace</h2></div><span className={`tag ${data.forceOffline ? 'tag-danger' : 'tag-live'}`}>{data.forceOffline ? 'DESCONEXIÓN FORZADA' : 'ENLACE AUTOMÁTICO'}</span></div><p className="lab-copy">Fuerza el modo sin enlace para comprobar la caché local. Al reactivarlo, el frontend busca el backend de nuevo cada 5 segundos.</p><button className={`button ${data.forceOffline ? 'button-primary' : 'button-danger'}`} onClick={() => data.setForceOffline((value) => !value)}>{data.forceOffline ? 'Restablecer enlace' : 'Simular pérdida de conexión'}</button>{data.forceOffline && <div className="data-cached">Vista sin enlace · datos en caché guardados {data.lastCachedAt ? new Date(data.lastCachedAt).toLocaleString('es') : 'sin marca de tiempo disponible'}.</div>}</section>
      <section className="panel lab-panel"><div className="panel-heading"><div><span className="eyebrow">APLICACIÓN INSTALABLE</span><h2>Prueba de la PWA</h2></div><span className="tag">SIN CONEXIÓN</span></div><p className="lab-copy">Ejecuta <code>npm run build</code> y <code>npm run preview</code>, abre la app una vez con conexión y luego desconéctate y recarga para comprobar la shell guardada. La instalación requiere localhost o HTTPS.</p></section>
      <div className="lab-metrics"><article className="panel lab-metric"><span>Origen de lecturas recientes</span><strong>{readings.length ? [...new Set(readings.map((reading) => reading.source === 'simulated' ? 'SIMULADO' : reading.source === 'live' ? 'EN VIVO' : reading.source || 'NO INDICADO'))].join(' · ') : 'Sin lecturas'}</strong></article><article className="panel lab-metric"><span>Lectura → alerta recibida</span><strong>{latency !== null ? `${latency} ms promedio · ${measured.length} eventos` : 'No medible todavía'}</strong><small>Medida en esta sesión; depende de las marcas temporales disponibles.</small></article></div>
      <section className="panel lab-panel limitations"><span className="eyebrow">LÍMITES DE VALIDACIÓN</span><h2>Falsos positivos y negativos</h2><p>Los rangos y reglas son orientativos para una demostración. El ruido, sensores descalibrados, movimiento, lecturas ausentes o perfiles no representativos pueden provocar alertas incorrectas o no detectar un evento. La explicación automática es informativa, no es un diagnóstico médico. No utilices el prototipo para tomar decisiones clínicas.</p></section>
    </div>
  );
}

export function EmptyPage({ title, description }) {
  const { connectionState } = useConnection();
  const { history } = useVitals();
  return <section className="panel page-placeholder"><span className="eyebrow">{connectionState === 'offline' ? 'MODO SIN ENLACE' : 'MÓDULO DE MISIÓN'}</span><h2>{title}</h2><p>{description}</p><small className="muted">{Object.keys(history).length ? 'Hay lecturas disponibles.' : 'Esperando datos para mostrar esta sección.'}</small></section>;
}

