// Origen.jsx · Rótulo del origen de un dato. Se distingue por texto, ícono y borde
// (no solo por color):
//   REAL                 viene de nuestro hardware (T1000-E; MAX30102 cuando exista)
//                        o del backend con source "live"
//   DEMO                 simulado por nosotros (simulador local, simulator.py, firmware DEMO)
//   REFERENCIA NASA      rango o dato tomado de una fuente NASA/CSA leída y citada
//   REGISTRO DEL USUARIO dato que la persona escribe a mano en este navegador
//                        (no viaja al backend)
// Datos y traducción de `source`: origenes.js
import { useState } from 'react';
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

// Leyenda con los cuatro orígenes y qué significa cada uno. Plegable: abierta en
// pantallas grandes y cerrada al inicio en el celular (los rótulos siguen visibles).
function abiertaAlInicio() {
  return typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(min-width: 721px)').matches;
}

export function LeyendaOrigen({ className = '' }) {
  const [abierta, setAbierta] = useState(abiertaAlInicio);
  return (
    <details className={`panel leyenda-origen${className ? ` ${className}` : ''}`} open={abierta} onToggle={(e) => setAbierta(e.currentTarget.open)}>
      <summary>
        <strong>ORIGEN DE LOS DATOS</strong>
        <span className="leyenda-resumen" aria-hidden="true">{['real', 'demo', 'nasa', 'usuario'].map((t) => <Origen key={t} tipo={t} compact />)}</span>
      </summary>
      <div className="leyenda-items">
        {['real', 'demo', 'nasa', 'usuario'].map((t) => (
          <div key={t}><Origen tipo={t} compact /><span>{ORIGENES[t].detalle}</span></div>
        ))}
      </div>
    </details>
  );
}
