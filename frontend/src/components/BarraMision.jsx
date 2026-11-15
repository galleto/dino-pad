// BarraMision.jsx · Línea de estado al pie (como el pie de la pantalla del DINO PAD):
// hora terrestre, hora de Marte, retraso de comunicación con señal animada, entorno,
// sonido y modo presentación.
import { useEffect, useState } from 'react';
import { ENTORNOS, horaMarte, retrasoDe, textoRetraso } from './entornos';
import { entornoStore, presentacionStore, sonidoStore, useStore } from './estadoMision';
import { sonar } from './sonido';

export default function BarraMision() {
  const [ahora, setAhora] = useState(() => Date.now());
  const [entornoId, setEntorno] = useStore(entornoStore);
  const [sonido, setSonido] = useStore(sonidoStore);
  const [presentacion, setPresentacion] = useStore(presentacionStore);
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const entorno = ENTORNOS[entornoId] || ENTORNOS.marte;
  const retraso = retrasoDe(entorno.id, ahora);
  const marte = horaMarte(ahora);
  const utc = new Date(ahora).toISOString().slice(11, 19);
  // La animación dura más cuanto mayor es el retraso (acotada para que siempre se vea)
  const dur = Math.min(7, Math.max(0.6, retraso / 150));
  return (
    <div className="barra-mision" role="group" aria-label="Reloj de misión y comunicaciones">
      <div className="bm-dato"><span>Tierra (UTC)</span><strong>{utc}</strong></div>
      <div className="bm-dato" title="Hora media coordinada de Marte (MTC), calculada con el algoritmo Mars24 de NASA GISS. Referencia a confirmar."><span>Marte (MTC) · sol de 24 h 39 min</span><strong>{marte.texto}</strong></div>
      <div className="bm-dato bm-retraso" title="Estimación con órbitas circulares y la velocidad de la luz. El valor real va de unos 3 a 22 minutos según la posición de los planetas.">
        <span>Retraso de la señal por trayecto · estimado</span>
        <strong>{textoRetraso(retraso)}</strong>
        <span className="bm-senal" aria-hidden="true"><b>Tierra</b><i><u style={{ animationDuration: `${dur}s` }} /></i><b>{entorno.id === 'luna' ? 'Luna' : entorno.id === 'estacion' ? 'órbita' : 'Marte'}</b></span>
      </div>
      <label className="bm-dato bm-entorno"><span>Entorno · gravedad {entorno.gravedad}</span>
        <select value={entorno.id} onChange={(e) => { setEntorno(e.target.value); sonar('clic'); }} aria-label="Entorno de misión">
          {Object.values(ENTORNOS).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
      </label>
      <p className="bm-nota">{entorno.nota}</p>
      <div className="bm-acciones">
        <button type="button" aria-pressed={sonido} onClick={() => { setSonido(!sonido); if (!sonido) setTimeout(() => sonar('ok'), 0); }}>Sonido {sonido ? 'activado' : 'apagado'}</button>
        <button type="button" aria-pressed={presentacion !== null} onClick={() => setPresentacion(presentacion === null ? 0 : null)}>{presentacion === null ? 'Modo presentación' : 'Detener presentación'}</button>
      </div>
    </div>
  );
}
