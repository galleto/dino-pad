
import './Header.css';

function Header({ connected }) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-mark" aria-hidden="true">✦</div>

        <div>
          <h1 className="header-title">SPACEHEALTH</h1>
          <span className="header-subtitle">CREW HEALTH MONITORING</span>
        </div>
      </div>

      <div className="header-meta" role="status">
        <span
          aria-hidden="true"
          className={`connection-indicator ${
            connected ? 'is-connected' : 'is-disconnected'
          }`}
        />
        <span>{connected ? 'SIMULADOR ACTIVO' : 'SIN CONEXIÓN'}</span>
        <span className="simulation-label">SIMULADO</span>
      </div>
    </header>
  );
}

export default Header;