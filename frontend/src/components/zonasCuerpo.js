// zonasCuerpo.js · Textos de presentación de la figura humana y del dossier.
// Solo capa visual: crewData.js no se modifica.
// - `funcion` y `cuandoAvisar` los escribió el equipo en lenguaje simple (NO son citas de la NASA).
// - `riesgoNasa` usa solo nombres de riesgos leídos en https://www.nasa.gov/hrp/risks/
//   (ver docs/cumplimiento-reto.md). Si no hay uno leído, queda null = "referencia a confirmar".
// - Las zonas con `ref: true` no tienen sensor ni indicador en este prototipo.

export const URL_RIESGOS = 'https://www.nasa.gov/hrp/risks/';
export const URL_PELIGROS = 'https://www.nasa.gov/hrp/hazards/';
export const URL_INVESTIGACION = 'https://www.nasa.gov/hrp/ongoing-hrp-research/';

export const ZONA_INFO = {
  hr: { titulo: 'Corazón', funcion: 'Bombea la sangre que lleva oxígeno y nutrientes a todo el cuerpo.', riesgoNasa: 'Cardiovascular Adaptations' },
  bp: { titulo: 'Arterias', funcion: 'Reparten la sangre por el cuerpo. La presión dice con qué fuerza circula.', riesgoNasa: 'Cardiovascular Adaptations' },
  spo2: { titulo: 'Pulmones', funcion: 'Pasan el oxígeno del aire a la sangre y sacan el dióxido de carbono.', riesgoNasa: 'Hypoxia' },
  temp: { titulo: 'Temperatura corporal', funcion: 'El cuerpo mantiene su temperatura en un margen estrecho para funcionar bien.', riesgoNasa: null },
  glu: { titulo: 'Metabolismo', funcion: 'El páncreas y el hígado regulan el azúcar en la sangre, que es la energía de las células.', riesgoNasa: 'Inadequate Food and Nutrition' },
  sleep: { titulo: 'Cerebro · sueño', funcion: 'Mientras duermes, el cerebro se recupera y fija lo aprendido.', riesgoNasa: 'Inadequate Sleep and Irregular Schedules' },
  mood: { titulo: 'Cerebro · ánimo', funcion: 'El cerebro regula las emociones, la atención y las decisiones.', riesgoNasa: 'Behavioral Changes and Psychiatric Disorders' },
  ojos: { ref: true, titulo: 'Ojos', funcion: 'Captan la luz y envían la imagen al cerebro.', hazards: [],
    porque: 'La NASA lista el síndrome neuro-ocular asociado al vuelo espacial (SANS) entre los riesgos de su Programa de Investigación Humana.',
    riesgoNasa: 'SANS', fuente: URL_RIESGOS },
  huesos: { ref: true, titulo: 'Huesos', funcion: 'Sostienen el cuerpo y protegen los órganos.', hazards: ['gravity'],
    porque: 'Según el peligro "campos gravitatorios" del HRP, los huesos, los músculos, el oído interno y los órganos deben ajustarse a cada nueva gravedad.',
    riesgoNasa: 'Spaceflight-Induced Bone Changes', fuente: URL_PELIGROS },
  musculo: { ref: true, titulo: 'Músculo', funcion: 'Mueve el cuerpo y sostiene la postura.', hazards: ['gravity'],
    porque: 'Según el peligro "campos gravitatorios" del HRP, los músculos y los huesos deben ajustarse a cada nueva gravedad.',
    riesgoNasa: 'Reduced Cardiorespiratory and Musculoskeletal Fitness', fuente: URL_PELIGROS },
  inmune: { ref: true, titulo: 'Sistema inmune', funcion: 'Defiende al cuerpo de las infecciones.', hazards: [],
    porque: 'La NASA estudia biomarcadores inmunes en la tripulación de Artemis II, y las Spaceflight Standard Measures incluyen muestras de saliva para inmunidad.',
    riesgoNasa: null, fuente: URL_INVESTIGACION },
};

// Regla del proyecto (no es un protocolo de la NASA): a quién avisar según el semáforo.
export const CUANDO_AVISAR = [
  { status: 'ok', texto: 'Normal: sigue con tu rutina de medición.' },
  { status: 'warn', texto: 'Atención: avisa a tu tripulación y repite la medición en unos minutos.' },
  { status: 'crit', texto: 'Crítico: avisa a tierra (cirujano de vuelo) de inmediato.' },
  { status: 'nodata', texto: 'Sin señal: revisa que el sensor esté bien colocado.' },
];
