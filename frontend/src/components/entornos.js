// entornos.js · Entornos de misión, hora de Marte y retraso de comunicación.
// Todo es contexto de presentación escrito por el equipo; los cálculos son estimaciones:
//  - Hora de Marte (MTC): fórmulas del algoritmo Mars24 de NASA GISS (Allison y McEwen).
//    Referencia a confirmar: https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
//  - Retraso Tierra-Marte: distancia con órbitas circulares en un mismo plano y la velocidad
//    de la luz (499 s por unidad astronómica). Da entre 4 y 21 min; el valor real va de
//    unos 3 a 22 min porque las órbitas son elípticas.
//  - Gravedad en superficie: Luna 0.17 g, Marte 0.38 g (valores redondeados).

export const ENTORNOS = {
  nave: { id: 'nave', nombre: 'Nave en tránsito', gravedad: 'microgravedad', marte: true, peligros: ['radiation', 'isolation', 'distance', 'gravity', 'environment'],
    nota: 'En el viaje a Marte el retraso crece cada día. Se muestra el de la distancia actual entre la Tierra y Marte.' },
  estacion: { id: 'estacion', nombre: 'Estación en órbita', gravedad: 'microgravedad', retrasoS: 0, peligros: ['gravity', 'environment', 'isolation'],
    nota: 'En órbita baja la comunicación con la Tierra es casi inmediata.' },
  rover: { id: 'rover', nombre: 'Rover en Marte', gravedad: '0.38 g', marte: true, peligros: ['distance', 'environment', 'radiation'],
    nota: 'Lejos de la base, la ayuda más cercana es tu propia tripulación.' },
  luna: { id: 'luna', nombre: 'Base lunar', gravedad: '0.17 g', retrasoS: 1.3, peligros: ['radiation', 'gravity', 'isolation'],
    nota: 'La señal tarda cerca de 1.3 segundos por trayecto.' },
  marte: { id: 'marte', nombre: 'Base marciana', gravedad: '0.38 g', marte: true, peligros: ['radiation', 'isolation', 'distance', 'gravity', 'environment'],
    nota: 'Con minutos de retraso no hay conversación en vivo con la Tierra.' },
};

const jdTT = (ms) => ms / 86400000 + 2440587.5 + 69.184 / 86400;

// Hora media coordinada de Marte (MTC) y fecha de sol marciano (MSD)
export function horaMarte(ms) {
  const msd = (jdTT(ms) - 2405522.0028779) / 1.0274912517;
  const horas = (((msd % 1) + 1) % 1) * 24;
  const h = Math.floor(horas);
  const m = Math.floor((horas - h) * 60);
  const s = Math.floor(((horas - h) * 60 - m) * 60);
  return { msd, texto: [h, m, s].map((v) => String(v).padStart(2, '0')).join(':') };
}

// Retraso de la señal Tierra-Marte en segundos, por trayecto (estimación)
export function retrasoMarteS(ms) {
  const d = jdTT(ms) - 2451545.0;
  const rad = Math.PI / 180;
  const delta = ((100.46 + 0.985647 * d) - (355.45 + 0.524033 * d)) * rad;
  const ua = Math.sqrt(1 + 1.524 ** 2 - 2 * 1.524 * Math.cos(delta));
  return ua * 499.005;
}

export function retrasoDe(entornoId, ms) {
  const e = ENTORNOS[entornoId] || ENTORNOS.marte;
  return e.marte ? retrasoMarteS(ms) : e.retrasoS;
}

export function textoRetraso(seg) {
  if (seg < 0.5) return 'casi inmediato';
  if (seg < 60) return `${seg.toFixed(1)} s`;
  return `${Math.floor(seg / 60)} min ${String(Math.round(seg % 60)).padStart(2, '0')} s`;
}
