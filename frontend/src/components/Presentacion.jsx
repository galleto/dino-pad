// Presentacion.jsx · MODO PRESENTACIÓN: recorre todas las vistas solo, para el escenario.
// Se inicia desde la barra de misión y se detiene con el botón o con Escape.
import { useEffect } from 'react';
import { presentacionStore, tormentaStore, useStore } from './estadoMision';
import { zonaStore } from './seleccion';

const SEGUNDOS = 9;
const PASOS = [
  { ruta: 'monitoreo', texto: 'Monitoreo: la figura humana y los 7 indicadores, cada uno con su semáforo y su origen.', al: () => zonaStore.set('') },
  { ruta: 'monitoreo', texto: 'Al tocar una zona: qué es, por qué cambia en el espacio, qué hacer y cuándo avisar.', al: () => zonaStore.set('hr') },
  { ruta: 'dinopad', texto: 'DINO PAD: el gemelo del dispositivo del astronauta. Hoy funciona con datos simulados.', al: () => zonaStore.set('') },
  { ruta: 'mapa', texto: 'Mapa de Jezero: base y tripulación con las coordenadas DEMO del firmware.' },
  { ruta: 'riesgos', texto: 'Los 5 peligros del vuelo espacial del HRP de la NASA, ligados a los indicadores y a sus fuentes.' },
  { ruta: 'bitacora', texto: 'Bitácora: registro manual, anillo de preparación de misión, rachas e insignias.' },
  { ruta: 'laboratorio', texto: 'Simulacro de tormenta solar: toda la interfaz pasa a modo refugio.', al: () => tormentaStore.set({ origen: 'demo', inicio: Date.now() }) },
  { ruta: 'alertas', texto: 'Alertas: prioridad, por qué se generó y qué acción se recomienda.', al: () => tormentaStore.set(null) },
  { ruta: 'historial', texto: 'Historial: cada lectura contra el rango normal y la línea base personal.' },
  { ruta: 'tendencias', texto: 'Tendencias: hacia dónde va cada indicador en cada tripulante.' },
  { ruta: 'tripulacion', texto: 'Tripulación: perfiles, líneas base y riesgos en los que se enfoca cada quien.' },
  { ruta: 'emergencia', texto: 'Emergencia: el SOS real llega aquí y se reconoce desde la base.' },
];

export default function Presentacion() {
  const [paso, setPaso] = useStore(presentacionStore);
  const activo = paso !== null;
  useEffect(() => {
    if (!activo) return undefined;
    const p = PASOS[paso % PASOS.length];
    p.al?.();
    if (window.location.hash !== `#/${p.ruta}`) window.location.hash = `#/${p.ruta}`;
    window.scrollTo({ top: 0 });
    const t = setTimeout(() => presentacionStore.set((n) => (n === null ? null : (n + 1) % PASOS.length)), SEGUNDOS * 1000);
    return () => clearTimeout(t);
  }, [paso, activo]);
  useEffect(() => {
    if (!activo) return undefined;
    const esc = (e) => { if (e.key === 'Escape') { tormentaStore.set(null); presentacionStore.set(null); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [activo]);
  if (!activo) return null;
  const i = paso % PASOS.length;
  const ir = (delta) => setPaso((i + PASOS.length + delta) % PASOS.length);
  return (
    <div className="presentacion" role="status" aria-label="Modo presentación">
      <span className="pres-cuenta">{String(i + 1).padStart(2, '0')}/{PASOS.length}</span>
      <p>{PASOS[i].texto}</p>
      <div className="pres-botones">
        <button type="button" onClick={() => ir(-1)}>Anterior</button>
        <button type="button" onClick={() => ir(1)}>Siguiente</button>
        <button type="button" onClick={() => { tormentaStore.set(null); setPaso(null); }}>Detener</button>
      </div>
      <i className="pres-progreso" key={paso} style={{ animationDuration: `${SEGUNDOS}s` }} aria-hidden="true" />
    </div>
  );
}
