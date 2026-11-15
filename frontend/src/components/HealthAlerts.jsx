import { INDICATORS } from '../data/crewData';
import { getRanges } from '../services/health';
import { sourceLabel } from '../services/readings';
import Term from './Term';

export default function HealthAlerts({ alerts, crewById = {}, latest = {}, compact = false, onSpeak, voiceSupported = false }) {
  if (!alerts.length) return <div className="empty-state">Sin alertas prioritarias. Todo en calma por ahora.</div>;
  return (
    <div className={`alerts-list${compact ? ' alerts-compact' : ''}`}>
      {alerts.map((alert) => {
        const indicator = INDICATORS[alert.indicatorId];
        const reading = latest[alert.crewId]?.[alert.indicatorId];
        const range = indicator && getRanges(indicator, crewById[alert.crewId]).ok;
        const timestamp = alert.timestamp ? new Date(Number(alert.timestamp) || alert.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';
        return (
          <article className={`alert-card alert-${alert.level}`} key={alert.id}>
            <div className="alert-card-head"><span className={`alert-level level-${alert.level}`}>{alert.level === 'critical' ? 'CRÍTICA' : alert.level === 'warning' ? 'ATENCIÓN' : 'INFORMACIÓN'}</span><time>{timestamp}</time></div>
            <h3>{indicator ? <Term id={indicator.id}>{indicator.name}</Term> : alert.title || 'Alerta de salud'}</h3>
            <p>{alert.message || 'Se recibió una alerta desde el dispositivo.'}</p>
            {voiceSupported && onSpeak && <button className="button alert-speak" type="button" onClick={() => onSpeak(alert)} aria-label={`Escuchar alerta: ${alert.title || 'alerta de salud'}`}>▶ Escuchar alerta</button>}
            {!compact && <div className="alert-detail"><strong>¿Por qué se generó?</strong><p>{reading?.value != null && range ? `${reading.value} ${indicator.unit} frente al rango normal ${range[0]}–${range[1]} ${indicator.unit}.` : alert.message || 'El dispositivo informó una condición que requiere atención.'}</p>{reading && <small className="reading-origin">Origen de lectura: {sourceLabel(reading.source)}</small>}</div>}
            {!compact && alert.action && <div className="alert-detail"><strong>Acción recomendada</strong><p>{alert.action}</p></div>}
            {!compact && <div className="ai-explanation"><strong>Explicación informativa</strong><p>{alert.aiExplanation || (alert.level === 'info' || !alert._receivedAt ? 'No hay explicación automática disponible para esta alerta.' : 'Analizando…')}</p><small>Informativo, no es un diagnóstico médico.</small></div>}
          </article>
        );
      })}
    </div>
  );
}
