// Dossier.jsx · Ficha lateral de una zona del cuerpo: función, valor y gráfica, rango,
// por qué la afecta el espacio (peligro HRP), qué hacer y cuándo avisar a tierra.
// Muestra los textos what / why / how / action de crewData.js. Solo presentación.
import { useEffect, useRef, useState } from 'react';
import { HAZARDS } from '../data/crewData';
import { getRanges, getStatus, STATUS_LABEL } from '../services/health';
import Origen from './Origen';
import { ENTORNOS, retrasoDe, textoRetraso } from './entornos';
import { entornoStore, useStore } from './estadoMision';
import { CUANDO_AVISAR, URL_PELIGROS, URL_RIESGOS, ZONA_INFO } from './zonasCuerpo';

function Grafica({ readings, ranges, unit }) {
  const values = readings.filter((r) => r?.quality !== 'no_signal' && r?.value != null && Number.isFinite(Number(r.value))).slice(-40).map((r) => Number(r.value));
  if (values.length < 2) return <div className="dossier-grafica-vacia">La gráfica aparece con la segunda lectura.</div>;
  const [ok0, ok1] = ranges.ok;
  const low = Math.min(...values, ok0);
  const high = Math.max(...values, ok1);
  const pad = (high - low) * 0.12 || 1;
  const y = (v) => 84 - ((v - (low - pad)) / (high - low + pad * 2)) * 78;
  const x = (i) => 34 + (i / (values.length - 1)) * 262;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="dossier-grafica" viewBox="0 0 300 92" role="img" aria-label={`Últimas ${values.length} lecturas; la banda marca el rango normal de ${ok0} a ${ok1} ${unit}`}>
      <rect className="dg-banda" x="34" y={y(ok1)} width="262" height={Math.max(y(ok0) - y(ok1), 1)} />
      <path className="dg-limite" d={`M34 ${y(ok1)}H296M34 ${y(ok0)}H296`} />
      <text className="dg-eje" x="28" y={y(ok1) + 3} textAnchor="end">{ok1}</text>
      <text className="dg-eje" x="28" y={y(ok0) + 3} textAnchor="end">{ok0}</text>
      <polyline className="dg-linea" points={pts} />
      <circle className="dg-punto" cx={x(values.length - 1)} cy={y(values.at(-1))} r="3" />
    </svg>
  );
}

function Seccion({ titulo, children, id, resaltar, refEl }) {
  return <section className={`dossier-seccion${resaltar ? ' is-foco' : ''}`} id={id} ref={refEl}><h3>{titulo}</h3>{children}</section>;
}

export default function Dossier({ zonaId, crew, indicators, latest, history, foco, onClose }) {
  const info = ZONA_INFO[zonaId];
  const indicator = indicators[zonaId];
  const [entornoId] = useStore(entornoStore);
  const entorno = ENTORNOS[entornoId] || ENTORNOS.marte;
  const [retraso] = useState(() => retrasoDe(entorno.id, Date.now()));
  const porqueRef = useRef(null);
  const cajaRef = useRef(null);
  useEffect(() => {
    if (foco === 'porque') porqueRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    else cajaRef.current?.scrollTo?.({ top: 0 });
  }, [zonaId, foco]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  if (!info) return null;

  const reading = latest?.[zonaId];
  const status = indicator ? getStatus(indicator, crew, reading) : 'ref';
  const ranges = indicator && getRanges(indicator, crew);
  const valor = reading?.quality === 'no_signal' || reading?.value == null ? '—' : reading.value;
  const hazards = indicator ? indicator.hazards || [] : info.hazards || [];
  const base = crew?.baseline?.[zonaId];

  return (
    <aside className={`dossier st-${status}`} aria-label={`Ficha de ${info.titulo}`} ref={cajaRef}>
      <header className="dossier-cabeza">
        <div><h2>{info.titulo}</h2><p>{indicator ? indicator.name : 'Sin sensor en este prototipo'}</p></div>
        <button type="button" className="dossier-cerrar" onClick={onClose} aria-label="Cerrar ficha">Cerrar ✕</button>
      </header>

      <Seccion titulo="Qué hace esta parte del cuerpo"><p>{info.funcion}</p></Seccion>

      {indicator ? (
        <Seccion titulo="Valor ahora">
          <div className="dossier-valor">
            <strong>{valor}</strong><span>{indicator.unit}</span>
            <span className="dossier-estado st-glyph">{STATUS_LABEL[status]}</span>
            {reading && <Origen source={reading.source} compact />}
          </div>
          <Grafica readings={history || []} ranges={ranges} unit={indicator.unit} />
          {(zonaId === 'hr' || zonaId === 'spo2') && <p className="dossier-nota"><a href="#/dinopad">Ver este dato en el DINO PAD (pestaña VITAL)</a></p>}
          <p className="dossier-rango">Rango normal <b>{ranges.ok[0]}–{ranges.ok[1]} {indicator.unit}</b>{Number.isFinite(base) && <> · tu valor habitual <b>{base} {indicator.unit}</b></>}. Son rangos del proyecto, no de la NASA.</p>
        </Seccion>
      ) : (
        <Seccion titulo="Valor ahora"><p>DINO PAD no mide esta zona: no hay sensor ni dato simulado. Se muestra como información de referencia.</p></Seccion>
      )}

      {indicator && <Seccion titulo="Qué se mide y cómo"><p>{indicator.what}</p><p>{indicator.how}</p></Seccion>}

      <Seccion titulo="¿Por qué importa en el espacio?" id="dossier-porque" resaltar={foco === 'porque'} refEl={porqueRef}>
        <p>{indicator ? indicator.why : info.porque}</p>
        {hazards.length > 0
          ? <p className="dossier-peligros">Peligros del HRP asociados: {hazards.map((h) => <a key={h} className="chip-peligro" href={URL_PELIGROS} target="_blank" rel="noreferrer">{HAZARDS[h] || h}</a>)}</p>
          : <p className="dossier-peligros">Peligro del HRP asociado: referencia a confirmar.</p>}
        {info.riesgoNasa
          ? <p className="dossier-fuente"><Origen tipo="nasa" compact /> Riesgo listado por el HRP: <a href={info.fuente || URL_RIESGOS} target="_blank" rel="noreferrer">{info.riesgoNasa}</a></p>
          : <p className="dossier-fuente">{info.fuente ? <><Origen tipo="nasa" compact /> <a href={info.fuente} target="_blank" rel="noreferrer">Investigación en curso del HRP</a></> : 'Riesgo del HRP: referencia a confirmar.'}</p>}
      </Seccion>

      <Seccion titulo="Qué hacer si sale mal">
        <p>{indicator ? indicator.action : 'Este prototipo no vigila esta zona. Sigue el plan médico de la misión y reporta cualquier síntoma a tu tripulación.'}</p>
      </Seccion>

      {indicator && (
        <Seccion titulo="Cuándo avisar">
          <ul className="dossier-avisar">
            {CUANDO_AVISAR.map((regla) => <li key={regla.status} className={`st-${regla.status}${regla.status === status ? ' is-actual' : ''}`}><span className="st-glyph" />{regla.texto}</li>)}
          </ul>
          <p className="dossier-nota">{retraso >= 60 ? `En ${entorno.nombre.toLowerCase()} una respuesta de tierra tarda al menos ${textoRetraso(retraso * 2)} (ida y vuelta, estimado): actúa primero con tu tripulación.` : `En ${entorno.nombre.toLowerCase()} la Tierra puede responder casi de inmediato.`}</p>
          <p className="dossier-nota">Regla del proyecto, no un protocolo médico.</p>
        </Seccion>
      )}
    </aside>
  );
}
