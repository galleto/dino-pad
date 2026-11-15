export const GLOSSARY = {
  hr: {
    label: 'Frecuencia cardíaca (HR)',
    definition: 'Cuenta cuántas veces late el corazón por minuto. Una lectura aislada no explica por sí sola por qué cambia.',
    related: ['bp'],
  },
  spo2: {
    label: 'Oxigenación (SpO₂)',
    definition: 'Estima cuánto oxígeno lleva la sangre. Un sensor óptico ilumina la piel y analiza la luz que regresa.',
    related: ['co2', 'respiratory'],
    diagram: [
      { title: 'Pulmones', description: 'El oxígeno entra al cuerpo al respirar.' },
      { title: 'Sangre', description: 'La sangre transporta ese oxígeno.' },
      { title: 'Tejidos', description: 'El oxígeno llega a las células.' },
    ],
  },
  bp: {
    label: 'Presión arterial (BP)',
    definition: 'Describe la fuerza de la sangre contra las paredes de las arterias. Este prototipo registra la presión sistólica.',
    related: ['hr', 'cardiovascular'],
  },
  glu: {
    label: 'Glucosa',
    definition: 'Es un azúcar que circula en la sangre y sirve de energía para las células. El valor de demostración no es una medición clínica.',
    related: ['metabolic'],
  },
  temp: {
    label: 'Temperatura',
    definition: 'Indica qué tan caliente está el cuerpo según la medición disponible. El prototipo la compara con un rango de referencia.',
    related: ['thermoregulation'],
  },
  sleep: {
    label: 'Sueño',
    definition: 'Resume las horas de descanso registradas en las últimas 24 horas. No describe por sí solo la calidad del sueño.',
    related: ['isolation'],
  },
  mood: {
    label: 'Ánimo',
    definition: 'Es una autoevaluación de cómo se siente la persona. No es un diagnóstico de salud mental.',
    related: ['isolation', 'distance'],
  },
  co2: {
    label: 'Dióxido de carbono (CO₂)',
    definition: 'Es un gas que exhalamos al respirar. En una cabina cerrada la ventilación ayuda a retirarlo; Dinopad no lo mide actualmente.',
    related: ['spo2', 'environment'],
  },
  cardiovascular: {
    label: 'Riesgo cardiovascular',
    definition: 'Se relaciona con el corazón, los vasos sanguíneos y el movimiento de fluidos. Dinopad muestra señales de referencia, no evalúa una enfermedad.',
    related: ['hr', 'bp'],
  },
  respiratory: {
    label: 'Riesgo respiratorio',
    definition: 'Se refiere a factores que pueden afectar la respiración y el intercambio de gases. Dinopad muestra SpO₂, pero no mide CO₂.',
    related: ['spo2', 'co2'],
  },
  metabolic: {
    label: 'Riesgo metabólico',
    definition: 'El metabolismo reúne procesos con los que el cuerpo usa energía. La glucosa es solo una de muchas señales posibles.',
    related: ['glu'],
  },
  thermoregulation: {
    label: 'Termorregulación',
    definition: 'Es la forma en que el cuerpo mantiene su temperatura. La lectura del prototipo es una referencia y puede variar.',
    related: ['temp'],
  },
  microgravity: {
    label: 'Microgravedad',
    definition: 'Es un entorno donde los objetos parecen flotar porque la gravedad se siente muy débil. Puede cambiar cómo se distribuyen los fluidos del cuerpo.',
    related: ['cardiovascular'],
  },
  radiation: {
    label: 'Radiación espacial',
    definition: 'Es energía y partículas que viajan por el espacio. La protección y el monitoreo dependen de la misión.',
    related: [],
  },
  isolation: {
    label: 'Aislamiento y confinamiento',
    definition: 'Describe pasar mucho tiempo en un espacio reducido y lejos de otras personas. Puede influir en el descanso y el bienestar.',
    related: ['sleep', 'mood'],
  },
  distance: {
    label: 'Distancia de la Tierra',
    definition: 'En misiones lejanas puede haber más demora al comunicarse con la Tierra. La misión define cómo organizar el apoyo.',
    related: ['mood'],
  },
  environment: {
    label: 'Ambiente cerrado',
    definition: 'Una cabina mantiene condiciones de vida controladas y requiere vigilar su ventilación. El prototipo no mide todos los factores ambientales.',
    related: ['co2', 'spo2'],
  },
};

export function getGlossaryEntry(id) {
  return GLOSSARY[id] || {
    label: id || 'Concepto',
    definition: 'Este concepto no tiene todavía una explicación local. Puedes consultarlo cuando el asistente tenga conexión.',
    related: [],
  };
}
