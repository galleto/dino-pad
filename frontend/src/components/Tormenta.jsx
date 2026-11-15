// Tormenta.jsx · MODO TORMENTA SOLAR. Solo capa visual: no crea, cambia ni reconoce alertas.
// Se activa con una alerta que hable de radiación o tormenta solar, o con el botón de
// simulacro de Laboratorio. El protocolo es un ejemplo del proyecto (referencia a confirmar).
import { useEffect, useRef, useState } from 'react';
import Origen from './Origen';
import { DURACION_REFUGIO_S, tormentaStore, useStore } from './estadoMision';
import { sonar } from './sonido';

const PASOS = [
  ['Deja lo que estás haciendo', 'Asegura herramientas y equipo. No termines la tarea.'],
  ['Avisa a tu tripulación', 'Di por radio que vas al refugio. Usa el DINO PAD si no hay voz.'],
  ['Ve al refugio', 'Es la zona con más blindaje del hábitat o de la nave.'],
  ['Pasen lista', 'Confirmen que toda la tripulación está dentro.'],
  ['Quédense dentro', 'Esperen el aviso de la base. Sigan midiendo sus indicadores.'],
];
const ES_RADIACION = /radiaci|radiation|tormenta solar|solar storm|evento solar/i;

function alertaDeRadiacion(alerts) {
  return alerts.find((a) => ES_RADIACION.test(`${a.title || ''} ${a.message || ''} ${a.indicatorId || ''}`));
}

export default function Tormenta({ alerts, crew }) {
  const [tormenta, setTormenta] = useStore(tormentaStore);
  const [ahora, setAhora] = useState(() => Date.now());
  const [hechos, setHechos] = useState({});
  const [presentes, setPresentes] = useState({});
  const descartada = useRef('');

  // Una alerta de radiación nueva enciende el modo (una vez por alerta)
  const alerta = alertaDeRadiacion(alerts);
  useEffect(() => {
    if (alerta && !tormentaStore.get() && descartada.current !== alerta.id) {
      setTormenta({ origen: 'alerta', inicio: Date.now(), alertaId: alerta.id, mensaje: alerta.message || alerta.title });
    }
  }, [alerta, setTormenta]);

  const activa = Boolean(tormenta);
  useEffect(() => {
    if (!activa) return undefined;
    sonar('alarma');
    const id = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(id);
  }, [activa]);

  if (!tormenta) return null;
  const resta = Math.max(0, DURACION_REFUGIO_S - Math.floor((ahora - tormenta.inicio) / 1000));
  const mm = String(Math.floor(resta / 60)).padStart(2, '0');
  const ss = String(resta % 60).padStart(2, '0');
  const actual = PASOS.findIndex((_, i) => !hechos[i]);
  const personas = Object.values(crew);
  const cerrar = () => { descartada.current = tormenta.alertaId || ''; setTormenta(null); setHechos({}); setPresentes({}); };

  return (
    <section className="tormenta" role="alert" aria-label="Modo tormenta solar">
      <div className="tormenta-franja" aria-hidden="true" />
      <div className="tormenta-cuerpo">
        <div className="tormenta-titulo">
          <h2>TORMENTA SOLAR</h2>
          <p>{tormenta.origen === 'demo' ? <><Origen tipo="demo" compact /> Simulacro iniciado en Laboratorio. No hay un evento real.</> : (tormenta.mensaje || 'Alerta de radiación recibida.')}</p>
        </div>
        <div className={`tormenta-reloj${resta === 0 ? ' is-cero' : ''}`}>
          <strong aria-live="off">{mm}:{ss}</strong>
          <span>{resta > 0 ? 'para estar en el refugio' : 'permanezcan en el refugio'}</span>
        </div>
        <ol className="tormenta-pasos">
          {PASOS.map(([titulo, detalle], i) => (
            <li key={titulo} className={`${hechos[i] ? 'is-hecho' : ''}${i === actual ? ' is-actual' : ''}`}>
              <label><input type="checkbox" checked={Boolean(hechos[i])} onChange={(e) => setHechos((h) => ({ ...h, [i]: e.target.checked }))} /><span className="tormenta-num">{i + 1}</span><strong>{titulo}</strong></label>
              <p>{detalle}</p>
              {i === 3 && <div className="tormenta-lista">{personas.map((p) => <label key={p.id}><input type="checkbox" checked={Boolean(presentes[p.id])} onChange={(e) => setPresentes((v) => ({ ...v, [p.id]: e.target.checked }))} />{p.name}</label>)}</div>}
            </li>
          ))}
        </ol>
        <div className="tormenta-pie">
          <span>Protocolo de ejemplo del proyecto; el tiempo es una regla del simulacro. Referencia a confirmar con el procedimiento de la misión.</span>
          <button type="button" className="button" onClick={cerrar}>{tormenta.origen === 'demo' ? 'Terminar simulacro' : 'Salir del modo tormenta'}</button>
        </div>
      </div>
    </section>
  );
}
