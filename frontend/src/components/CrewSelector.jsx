import { getOverallStatus, STATUS_LABEL } from '../services/health';
import './CrewSelector.css';

// latest es opcional: si no se pasa, no se muestra el estado de salud
export default function CrewSelector({ crew, activeCrewId, onChange, latest }) {
  return (
    <div className="cs" role="group" aria-label="Seleccionar tripulante">
      {crew.map((person) => {
        const isActive = person.id === activeCrewId;
        const readings = latest?.[person.id];
        const hasReading =
          readings &&
          Object.values(readings).some(
            (r) => r?.quality !== 'no_signal' && r?.value != null,
          );
        const status = hasReading ? getOverallStatus(person, readings) : 'nodata';
        const statusText = hasReading ? STATUS_LABEL[status] : 'Esperando';

        return (
          <button
            key={person.id}
            type="button"
            className={`cs-option${isActive ? ' is-active' : ''}`}
            style={person.accent ? { '--cs-accent': person.accent } : undefined}
            aria-pressed={isActive}
            onClick={() => onChange(person.id)}
          >
            <span className="cs-initial" aria-hidden="true">
              {person.name?.slice(0, 1) || '?'}
            </span>

            <span className="cs-info">
              <span className="cs-name">{person.name}</span>
              <span className="cs-role">{person.role}</span>
            </span>

            {latest && (
              <span className={`cs-status cs-status-${status}`}>
                <i aria-hidden="true" />
                {statusText}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}