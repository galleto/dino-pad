import { useState } from 'react';
import { CREW, INDICATORS, ZONES } from './data/crewData';
import { useVitals } from './hooks/useVitals';
import { getStatus, STATUS_LABEL, buildAlerts } from './services/health';
import Header from './components/Header';
import './App.css';

const CREW_LIST = Object.values(CREW);
const INDICATOR_LIST = Object.values(INDICATORS);

function App() {
  const [selectedCrewId, setSelectedCrewId] = useState(CREW_LIST[0]?.id);

  const { latest, connected } = useVitals();

  const selectedCrew =
    CREW_LIST.find((crew) => crew.id === selectedCrewId) || CREW_LIST[0];

  if (!selectedCrew) {
    return <main>No hay tripulantes registrados.</main>;
  }

  const latestByIndicator = latest[selectedCrew.id] || {};
  const alerts = buildAlerts(selectedCrew, latestByIndicator);

  return (
    <div className="app">
      {/* Componente nuevo: reemplaza al <header className="topbar"> anterior */}
      <Header connected={connected} />

      <main className="app-content">
        <section className="mission-heading">
          <div>
            <p className="eyebrow">NASA Space Health Project</p>
            <h2>Mission Health Dashboard</h2>
            <p>Monitoreo de salud de la tripulación</p>
          </div>
        </section>

        <section className="crew-section">
          <h3>Tripulación</h3>

          <div className="crew-selector">
            {CREW_LIST.map((crew) => (
              <button
                key={crew.id}
                type="button"
                aria-pressed={selectedCrewId === crew.id}
                className={
                  selectedCrewId === crew.id
                    ? 'crew-button active'
                    : 'crew-button'
                }
                onClick={() => setSelectedCrewId(crew.id)}
              >
                <span className="crew-avatar">
                  {crew.name.charAt(0).toUpperCase()}
                </span>

                <span>
                  <strong>{crew.name}</strong>
                  <small>{crew.role}</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="panel vitals-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Biometric data</p>
                <h3>Indicadores de salud</h3>
              </div>
              <span className="live-label">● SIMULADO</span>
            </div>

            <div className="vitals-grid">
              {INDICATOR_LIST.map((indicator) => {
                const reading = latestByIndicator[indicator.id];
                const status = getStatus(indicator, selectedCrew, reading);

                return (
                  <article className="vital-card" key={indicator.id}>
                    <div className="vital-card-top">
                      <span>{indicator.name}</span>
                      <span className={`status status-${status}`}>
                        {STATUS_LABEL[status] || status}
                      </span>
                    </div>

                    <div className="vital-value">
                      {reading?.quality === 'no_signal'
                        ? '--'
                        : reading?.value ?? '--'}
                      <small>{indicator.unit}</small>
                    </div>

                    <p className="vital-zone">
                      Zona: {ZONES[indicator.zone]?.name || 'General'}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="panel alerts-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Health notifications</p>
                <h3>Alertas</h3>
              </div>
              <span className="alert-count">{alerts.length}</span>
            </div>

            {alerts.length === 0 ? (
              <p className="empty-alerts">Sin alertas por el momento.</p>
            ) : (
              <div className="alerts-list">
                {alerts.map((alert) => (
                  <article
                    className={`alert-card alert-${alert.level}`}
                    key={alert.id}
                  >
                    <strong>{alert.title}</strong>
                    <p>{alert.message}</p>
                    <small>{alert.action}</small>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </section>
      </main>

      <footer className="app-footer">
        <span>SPACEHEALTH · PROTOTIPO</span>
        <span>Datos simulados · No utilizar para decisiones médicas</span>
      </footer>
    </div>
  );
}

export default App;