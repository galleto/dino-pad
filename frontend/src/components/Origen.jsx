// Origen.jsx · Rótulo del origen de un dato. Se distingue por texto, ícono y borde
// (no solo por color):
//   REAL                 viene de nuestro hardware (T1000-E; MAX30102 cuando exista)
//                        o del backend con source "live"
//   DEMO                 simulado por nosotros (simulador local, simulator.py, firmware DEMO)
//   REFERENCIA NASA      rango o dato tomado de una fuente NASA/CSA leída y citada
//   REGISTRO DEL USUARIO dato que la persona escribe a mano en este navegador
//                        (no viaja al backend)
// Datos y traducción de `source`: origenes.js
import { useEffect, useRef } from 'react';
import { ORIGENES, origenDeSource } from './origenes';

function Icono({ tipo }) {
  // Íconos propios: punto lleno (real), rombo (demo), estrella (nasa), lápiz (usuario)
  if (tipo === 'real') return <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="3.2" fill="currentColor" /><circle cx="6" cy="6" r="5.3" fill="none" stroke="currentColor" strokeWidth="1" opacity=".5" /></svg>;
  if (tipo === 'demo') return <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 6 6 11 1 6Z" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
  if (tipo === 'nasa') return <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .8 7.4 4.6 11.2 6 7.4 7.4 6 11.2 4.6 7.4.8 6 4.6 4.6Z" fill="currentColor" /></svg>;
  if (tipo === 'usuario') return <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 10 2.6 7.6 8.3 1.9 10.1 3.7 4.4 9.4Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" /></svg>;
}

// Uso: <Origen tipo="demo" /> o <Origen source={reading.source} />
export default function Origen({ tipo, source, compact = false, className = '' }) {
  const t = tipo || origenDeSource(source);
  const info = ORIGENES[t] || ORIGENES.desconocido;
  return (
    <span className={`origen origen-${t}${compact ? ' origen-compact' : ''}${className ? ` ${className}` : ''}`} title={info.detalle}>
      <Icono tipo={t} />
      {info.label}
    </span>
  );
}

const TIPOS = ['real', 'demo', 'nasa', 'usuario'];

// Clave compacta para la barra de título: cuatro íconos y, al abrir, qué significa cada origen.
export function ClaveOrigen() {
  const ref = useRef(null);
  useEffect(() => {
    const cerrar = (e) => {
      const el = ref.current;
      if (el?.open && (e.key === 'Escape' || (e.type === 'pointerdown' && !el.contains(e.target)))) el.open = false;
    };
    document.addEventListener('pointerdown', cerrar);
    document.addEventListener('keydown', cerrar);
    return () => {
      document.removeEventListener('pointerdown', cerrar);
      document.removeEventListener('keydown', cerrar);
    };
  }, []);
  return (
    <details className="clave-origen" ref={ref}>
      <summary aria-label="Origen de los datos: qué significa cada rótulo">
        <span className="clave-iconos" aria-hidden="true">{TIPOS.map((t) => <span key={t} className={`clave-ico clave-ico-${t}`}><Icono tipo={t} /></span>)}</span>
        <span className="clave-texto">Origen de los datos</span>
      </summary>
      <div className="clave-popover"><LeyendaOrigen /></div>
    </details>
  );
}

// Lista con los cuatro orígenes y qué significa cada uno.
export function LeyendaOrigen({ className = '' }) {
  return (
    <dl className={`leyenda-origen${className ? ` ${className}` : ''}`}>
      {TIPOS.map((t) => (
        <div key={t}><dt><Origen tipo={t} /></dt><dd>{ORIGENES[t].detalle}</dd></div>
      ))}
    </dl>
  );
}
