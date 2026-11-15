// Intro.jsx · Entrada de unos 5 segundos, una vez por sesión y omitible con clic, toque o
// cualquier tecla. No se muestra con prefers-reduced-motion. No afirma ninguna conexión:
// solo presenta el proyecto y dice de dónde saldrán los datos.
import { useEffect, useState } from 'react';

const CLAVE = 'dinopad-intro-vista';

function debeMostrarse() {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return sessionStorage.getItem(CLAVE) !== '1';
  } catch { return false; }
}

export default function Intro() {
  const [visible, setVisible] = useState(debeMostrarse);
  const [saliendo, setSaliendo] = useState(false);
  useEffect(() => {
    if (!visible) return undefined;
    try { sessionStorage.setItem(CLAVE, '1'); } catch { /* sin almacenamiento */ }
    const cerrar = () => setSaliendo(true);
    const t1 = setTimeout(cerrar, 4700);
    window.addEventListener('keydown', cerrar);
    return () => { clearTimeout(t1); window.removeEventListener('keydown', cerrar); };
  }, [visible]);
  useEffect(() => {
    if (!saliendo) return undefined;
    const t = setTimeout(() => setVisible(false), 450);
    return () => clearTimeout(t);
  }, [saliendo]);
  if (!visible) return null;
  return (
    <div className={`intro${saliendo ? ' is-saliendo' : ''}`} role="dialog" aria-label="Presentación de DINO PAD" onClick={() => setSaliendo(true)}>
      <div className="intro-caja">
        <div className="intro-marca" aria-hidden="true">D</div>
        <h1>DINO PAD</h1>
        <p className="intro-lema">Salud de la tripulación, de la Luna a Marte</p>
        <ul className="intro-lineas">
          <li>Dinobotics TecNM · NASA Space Apps Ciudad de México</li>
          <li>Monitor de base y ventana al dispositivo del astronauta</li>
          <li>Buscando la base. Si no responde, se usa el simulador local (DEMO)</li>
        </ul>
        <div className="intro-barra" aria-hidden="true"><i /></div>
        <button type="button" className="intro-omitir" onClick={() => setSaliendo(true)}>Omitir</button>
      </div>
    </div>
  );
}
