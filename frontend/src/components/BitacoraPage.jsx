// BitacoraPage.jsx · "Mi bitácora": registro manual (REGISTRO DEL USUARIO), anillo de
// preparación de misión, racha, insignias y recordatorios de medición.
import { useEffect, useState } from 'react';
import { useConnection } from '../hooks/useConnection';
import { getRanges, getStatus, STATUS_LABEL } from '../services/health';
import Origen from './Origen';
import { useStore } from './estadoMision';
import { agregar, borrar, diaDe, insignias, racha, recordatorios, registroStore, tareasDelDia, TAREAS, TIPOS, ultimosDias } from './registro';
import { sonar } from './sonido';
import { lineaSuave } from './trazos';
import '../styles/bitacora.css';

function Anillo({ hechas, total }) {
  const R = 86;
  const C = 2 * Math.PI * R;
  const pct = hechas / total;
  return (
    <svg className="anillo" viewBox="0 0 220 220" role="img" aria-label={`Preparación de misión de hoy: ${hechas} de ${total} tareas`}>
      {Array.from({ length: 48 }, (_, k) => { const a = (k * 7.5 * Math.PI) / 180; return <path key={k} className="anillo-marca" d={`M${110 + 101 * Math.cos(a)} ${110 + 101 * Math.sin(a)}L${110 + (k % 12 ? 105 : 108) * Math.cos(a)} ${110 + (k % 12 ? 105 : 108) * Math.sin(a)}`} />; })}
      <circle className="anillo-fondo" cx="110" cy="110" r={R} />
      <circle className="anillo-valor" cx="110" cy="110" r={R} strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 110 110)" />
      <text x="110" y="118" textAnchor="middle" className="anillo-num">{Math.round(pct * 100)}<tspan className="anillo-pct">%</tspan></text>
      <text x="110" y="142" textAnchor="middle" className="anillo-sub">{hechas} de {total} tareas</text>
    </svg>
  );
}

function Serie({ entradas, tipo, indicator, crew }) {
  const datos = entradas.filter((e) => e.tipo === tipo.id).slice(-14);
  const ok = indicator ? getRanges(indicator, crew).ok : null;
  if (datos.length < 2) return <div className="serie-vacia">Anota al menos dos veces para ver tu línea.</div>;
  const vals = datos.map((d) => d.valor);
  const lo = Math.min(...vals, ...(ok || []));
  const hi = Math.max(...vals, ...(ok || []));
  const pad = (hi - lo) * 0.15 || 1;
  const y = (v) => 70 - ((v - (lo - pad)) / (hi - lo + pad * 2)) * 62;
  const pts = datos.map((d, i) => [8 + (i / (datos.length - 1)) * 284, y(d.valor)]);
  return (
    <svg className="serie" viewBox="0 0 300 78" role="img" aria-label={`Tus últimos ${datos.length} registros de ${tipo.nombre}`}>
      {ok && <rect className="dg-banda" x="8" y={y(ok[1])} width="284" height={Math.max(1, y(ok[0]) - y(ok[1]))} />}
      <path className="serie-linea" d={lineaSuave(pts)} />
      {pts.map(([px, py], i) => <circle key={i} className="serie-punto" cx={px} cy={py} r="2.6"><title>{datos[i].valor} {tipo.unidad} · {new Date(datos[i].ts).toLocaleString('es')}</title></circle>)}
    </svg>
  );
}

export default function BitacoraPage() {
  const data = useConnection();
  const [todo] = useStore(registroStore);
  const [ahora, setAhora] = useState(() => Date.now());
  const [borrador, setBorrador] = useState({ mood: '', sleep: '', glu: '' });
  const [aviso, setAviso] = useState('');
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const crewId = data.activeCrewId;
  const persona = data.crew[crewId];
  const entradas = todo[crewId] || [];
  const tareas = tareasDelDia(entradas, diaDe(ahora));
  const hechas = TAREAS.filter((t) => tareas[t]).length;
  const dias = ultimosDias(entradas, 7, ahora);
  const rachaActual = racha(entradas, ahora);
  const avisos = recordatorios(entradas, ahora);
  const medallas = insignias(entradas, ahora);

  const guardar = (tipo) => {
    const valor = Number(borrador[tipo.id]);
    if (borrador[tipo.id] === '' || !Number.isFinite(valor) || valor < tipo.min || valor > tipo.max) { setAviso(`Escribe un valor de ${tipo.nombre.toLowerCase()} entre ${tipo.min} y ${tipo.max}.`); return; }
    agregar(crewId, tipo.id, valor);
    setBorrador((b) => ({ ...b, [tipo.id]: '' }));
    setAviso(`${tipo.nombre} guardado: ${valor} ${tipo.unidad}.`);
    sonar('ok');
  };

  return (
    <div className="bitacora">
      <div className="section-heading"><div><h2>Mi bitácora</h2><p>Lo que anotas aquí es tuyo: se guarda solo en este navegador y no se envía a la base. No reemplaza las lecturas de los sensores.</p></div><Origen tipo="usuario" /></div>
      <div className="bit-layout">
        <section className="bit-anillo" aria-label="Preparación de misión">
          <Anillo hechas={hechas} total={TAREAS.length} />
          <h3>Preparación de misión</h3>
          <p className="bit-persona">{persona?.name}</p>
          <div className="bit-racha"><strong>{rachaActual}</strong><span>{rachaActual === 1 ? 'día seguido completo' : 'días seguidos completos'}</span></div>
          <ol className="bit-semana" aria-label="Últimos 7 días">
            {dias.map((d) => <li key={d.dia} className={d.hechas === TAREAS.length ? 'is-completo' : d.hechas ? 'is-parcial' : ''} title={`${d.dia}: ${d.hechas} de ${TAREAS.length} tareas`}><i style={{ '--lleno': d.hechas / TAREAS.length }} /><span>{d.letra}</span></li>)}
          </ol>
        </section>

        <section className="bit-registro" aria-label="Registrar una medición">
          <header className="col-head"><h2>Registrar ahora</h2><Origen tipo="usuario" compact /></header>
          {Object.values(TIPOS).map((tipo) => {
            const indicator = data.indicators[tipo.id];
            const ultima = entradas.filter((e) => e.tipo === tipo.id).at(-1);
            const st = ultima && indicator ? getStatus(indicator, persona, { value: ultima.valor }) : 'nodata';
            const rango = indicator ? getRanges(indicator, persona).ok : null;
            return (
              <form key={tipo.id} className={`bit-campo st-${st}`} onSubmit={(e) => { e.preventDefault(); guardar(tipo); }}>
                <label htmlFor={`bit-${tipo.id}`}>{tipo.pregunta}</label>
                <div className="bit-entrada">
                  <input id={`bit-${tipo.id}`} className="field" type="number" inputMode="decimal" min={tipo.min} max={tipo.max} step={tipo.paso} value={borrador[tipo.id]} onChange={(e) => setBorrador((b) => ({ ...b, [tipo.id]: e.target.value }))} placeholder={tipo.unidad} />
                  <button type="submit" className="button button-primary">Guardar {tipo.nombre.toLowerCase()}</button>
                </div>
                <p className="bit-ultima">{ultima ? <><span className="st-glyph">Último: <b>{ultima.valor} {tipo.unidad}</b> · {STATUS_LABEL[st]}</span> · {new Date(ultima.ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</> : 'Aún no has anotado nada.'}{rango && <> · rango del proyecto {rango[0]}–{rango[1]} {tipo.unidad}</>}</p>
                {ultima && st !== 'ok' && st !== 'nodata' && indicator && <p className="bit-consejo">{indicator.action}</p>}
                <Serie entradas={entradas} tipo={tipo} indicator={indicator} crew={persona} />
              </form>
            );
          })}
          <div className="bit-revision">
            <button type="button" className={`button${tareas.revision ? ' button-primary' : ''}`} disabled={tareas.revision} onClick={() => { agregar(crewId, 'revision', 1); setAviso('Revisión de hoy anotada.'); sonar('ok'); }}>{tareas.revision ? 'Revisión de hoy hecha' : 'Ya revisé mis indicadores hoy'}</button>
            <a href="#/monitoreo">Ir a Monitoreo</a>
          </div>
          <p className="bit-aviso" role="status">{aviso}</p>
        </section>

        <aside className="bit-lado">
          <section>
            <header className="col-head"><h2>Recordatorios</h2><span>{avisos.filter((a) => a.pendiente).length} pendientes</span></header>
            <ul className="bit-recordatorios">
              {avisos.map((a) => (
                <li key={a.id} className={a.pendiente ? 'is-pendiente' : ''}>
                  <span className="bit-marca" aria-hidden="true">{a.pendiente ? '◆' : '✓'}</span>
                  <div><strong>{a.nombre}</strong><small>{a.cada}{a.pendiente ? ' · toca hacerlo' : a.faltaMin ? ` · en ${a.faltaMin >= 60 ? `${Math.floor(a.faltaMin / 60)} h ${a.faltaMin % 60} min` : `${a.faltaMin} min`}` : ' · hecho hoy'}</small></div>
                </li>
              ))}
            </ul>
            <p className="bit-nota">La frecuencia es una regla del proyecto, no una indicación médica.</p>
          </section>
          <section>
            <header className="col-head"><h2>Insignias</h2><span>{medallas.filter((m) => m.lograda).length} de {medallas.length}</span></header>
            <ul className="bit-insignias">
              {medallas.map((m) => <li key={m.id} className={m.lograda ? 'is-lograda' : ''}><i aria-hidden="true" /><div><strong>{m.nombre}</strong><small>{m.lograda ? 'Conseguida' : m.como}</small></div></li>)}
            </ul>
          </section>
          <button type="button" className="button bit-borrar" disabled={!entradas.length} onClick={() => { if (window.confirm(`¿Borrar todo el registro de ${persona?.name} en este navegador?`)) { borrar(crewId); setAviso('Registro borrado.'); } }}>Borrar mi registro</button>
        </aside>
      </div>
    </div>
  );
}
