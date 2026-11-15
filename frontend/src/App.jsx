import { useEffect, useState } from 'react';
import { useVitals } from './hooks/useVitals';
import { useConnection } from './hooks/useConnection';
import { AlertsPage, CrewPage, EmergencyPage, EmptyPage, HistoryPage, LabPage, MonitorPage, RisksPage, TrendsPage } from './components/Pages';
import MapsPage from './components/MapsPage';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';

const NAV_ITEMS = [
  ['monitoreo', '01', 'Monitoreo'],
  ['alertas', '02', 'Alertas'],
  ['historial', '03', 'Historial'],
  ['tendencias', '04', 'Tendencias'],
  ['tripulacion', '05', 'Tripulación'],
  ['riesgos', '06', 'Riesgos NASA'],
  ['emergencia', '07', 'Emergencia'],
  ['laboratorio', '08', 'Laboratorio'],
  ['mapas', '09', 'Mapas'],
];

const PAGE_TITLES = Object.fromEntries(NAV_ITEMS.map(([id, , label]) => [id, label]));

function getRoute() {
  const route = window.location.hash.replace(/^#\/?/, '');
  return PAGE_TITLES[route] ? route : 'monitoreo';
}

function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function App() {
  // El frontend original era un panel de simulación; se conservan sus rangos, datos y lógica.
  const [route, setRoute] = useState(getRoute);
  const [pwaUpdateAvailable, setPwaUpdateAvailable] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [appInstalled, setAppInstalled] = useState(isAppInstalled);
  const [pwaError, setPwaError] = useState(false);
  const { crew, activeCrewId, setActiveCrewId } = useVitals();
  const { connectionState, alerts, acknowledgeSos, acknowledgedSos, synchronized, cacheWarning, lastCachedAt } = useConnection();
  const activeCrew = crew[activeCrewId] || Object.values(crew)[0];
  const connectionLabel = { live: 'EN VIVO', simulator: 'SIMULADOR LOCAL', offline: 'SIN ENLACE', checking: 'CONECTANDO' }[connectionState];
  const sosAlert = alerts.find((alert) => /sos/i.test(`${alert.title || ''} ${alert.action || ''}`) && alert.id !== acknowledgedSos);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const onUpdateAvailable = () => setPwaUpdateAvailable(true);
    const onPwaError = () => setPwaError(true);
    const onInstallPrompt = (event) => {
      event.preventDefault();
      if (!isAppInstalled()) setInstallPrompt(event);
    };
    const onInstalled = () => {
      setAppInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('dinopad-update-available', onUpdateAvailable);
    window.addEventListener('dinopad-pwa-error', onPwaError);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('dinopad-update-available', onUpdateAvailable);
      window.removeEventListener('dinopad-pwa-error', onPwaError);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome !== 'accepted') setInstallPrompt(null);
    } catch {
      setPwaError(true);
    }
  };

  return (
    <div className="app-shell scanlines">
      <aside className="sidebar" aria-label="Navegación principal">
        <a className="brand" href="#/monitoreo" aria-label="Dinopad, ir a Monitoreo">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span className="brand-copy"><strong>DINOPAD</strong><small>SISTEMA DE SALUD ESPACIAL</small></span>
        </a>
        <div className="nav-caption">CENTRO DE MISIÓN</div>
        <nav className="nav-list">
          {NAV_ITEMS.map(([id, number, label]) => (
            <a key={id} href={`#/${id}`} className={`nav-link${route === id ? ' active' : ''}`} aria-label={label} aria-current={route === id ? 'page' : undefined}>
              <span className="nav-number">{number}</span><span className="nav-label">{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom"><span className="status-dot" /> SISTEMA OPERATIVO <small>CONTROL DE MISIÓN · 2026</small></div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title"><span className="eyebrow">DINOPAD / {String(NAV_ITEMS.find(([id]) => id === route)?.[0] || '').toUpperCase()}</span><h1>{PAGE_TITLES[route]}</h1></div>
          <div className="topbar-meta"><span className={`connection-pill connection-${connectionState}`} role="status"><i /> {connectionLabel}</span>{pwaUpdateAvailable && <button className="pwa-action" onClick={() => window.location.reload()}>Nueva versión disponible, recargar</button>}{installPrompt && !appInstalled && <button className="pwa-action" onClick={installApp}>Instalable · Instalar</button>}{pwaError && <span className="pwa-status" role="status">PWA no disponible</span>}<label className="crew-chip"><span className="avatar">{activeCrew?.name?.slice(0, 1) || '—'}</span><span><select aria-label="Tripulante activo" value={activeCrew?.id || ''} onChange={(event) => setActiveCrewId(event.target.value)}>{Object.values(crew).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><small>TRIPULANTE ACTIVO</small></span></label></div>
        </header>
        {sosAlert && <div className="sos-banner" role="alert"><span className="sos-beacon" /><div><strong>ALERTA SOS RECIBIDA</strong><p>{sosAlert.message || 'Se requiere atención inmediata de la tripulación.'}</p></div><button className="button button-danger" onClick={() => acknowledgeSos(sosAlert.id)}>Reconocer SOS</button></div>}
        {synchronized && <div className="sync-notice" role="status">● Sincronizado con el backend</div>}
        {cacheWarning && <div className="cache-warning" role="status">{cacheWarning}</div>}
        <main className="page-content">
          {connectionState === 'offline' && <div className="data-cached cache-banner" role="status">SIN ENLACE · Datos en caché {lastCachedAt ? `guardados ${new Date(lastCachedAt).toLocaleString('es')}` : 'sin historial local guardado'}.</div>}
          {route === 'monitoreo' ? <MonitorPage /> : route === 'alertas' ? <AlertsPage /> : route === 'historial' ? <HistoryPage /> : route === 'tendencias' ? <TrendsPage /> : route === 'tripulacion' ? <CrewPage /> : route === 'riesgos' ? <RisksPage /> : route === 'emergencia' ? <EmergencyPage /> : route === 'laboratorio' ? <LabPage /> : route === 'mapas' ? <MapsPage /> : <EmptyPage title={PAGE_TITLES[route]} description="Módulo de misión." />}
        </main>
        <footer className="app-footer"><span>DINOPAD · NASA SPACE APPS 2026</span><span>Prototipo de monitoreo · No es un dispositivo médico</span></footer>
      </div>
    </div>
  );
}

export default App;
