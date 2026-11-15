export const VITAL_THRESHOLDS = {
  hr: { normal: [60, 100], criticalBelow: 40, criticalAbove: 150 },
  bp: {
    normalSystolicBelow: 120,
    normalDiastolicBelow: 80,
    hypertensionSystolicAt: 130,
    hypertensionDiastolicAt: 80,
    hypotensionSystolicBelow: 90,
    hypotensionDiastolicBelow: 60,
  },
  spo2: { normal: [95, 100], criticalBelow: 90, respiratoryNormal: [12, 20] },
  temp: { normal: [36.1, 37.2], feverAt: 38, hypothermiaBelow: 35 },
  glu: { normal: [70, 99], hypoglycemiaBelow: 70, hyperglycemiaAt: 126 },
  sleep: { normal: [7, 9], insufficientBelow: 6 },
  mood: { min: 1, max: 5, lowAt: 2, normalMinimum: 3 },
};

export const VITALS_CONFIG = {
  hr: {
    name: 'Frecuencia cardíaca',
    organ: ['heart'],
    organLabel: 'Corazón',
    mainKey: 'hr',
    unit: 'lpm',
    slider: { key: 'hr', min: 30, max: 180, step: 1, label: 'Frecuencia cardíaca' },
    range: { min: 30, max: 180, normal: VITAL_THRESHOLDS.hr.normal, label: 'Normal: 60–100 lpm' },
  },
  bp: {
    name: 'Presión arterial',
    organ: ['heart'],
    organLabel: 'Corazón',
    mainKey: 'bp',
    unit: 'mmHg',
    slider: { key: 'bp', min: 50, max: 180, step: 1, label: 'Sistólica' },
    secondarySlider: { key: 'bpDia', min: 40, max: 130, step: 1, label: 'Diastólica', unit: 'mmHg' },
    range: { min: 50, max: 180, normal: [90, 119], label: 'Sistólica: normal <120 mmHg' },
    secondaryRange: { min: 40, max: 130, normal: [60, 79], label: 'Diastólica: normal <80 mmHg' },
  },
  spo2: {
    name: 'Pulmones',
    organ: ['lung_l', 'lung_r'],
    organLabel: 'Pulmones',
    mainKey: 'spo2',
    unit: '%',
    slider: { key: 'spo2', min: 70, max: 100, step: 1, label: 'SpO₂' },
    secondarySlider: { key: 'resp', min: 5, max: 40, step: 1, label: 'Respiración', unit: 'resp/min' },
    range: { min: 70, max: 100, normal: VITAL_THRESHOLDS.spo2.normal, label: 'SpO₂ normal: 95–100%' },
    secondaryRange: { min: 5, max: 40, normal: VITAL_THRESHOLDS.spo2.respiratoryNormal, label: 'Respiración normal: 12–20 resp/min' },
  },
  temp: {
    name: 'Temperatura',
    organ: ['brain'],
    organLabel: 'Cerebro · referencia térmica',
    mainKey: 'temp',
    unit: '°C',
    slider: { key: 'temp', min: 32, max: 42, step: 0.1, label: 'Temperatura' },
    range: { min: 32, max: 42, normal: VITAL_THRESHOLDS.temp.normal, label: 'Normal: 36.1–37.2 °C' },
  },
  glu: {
    name: 'Glucosa en ayunas',
    organ: ['pancreas'],
    organLabel: 'Páncreas',
    mainKey: 'glu',
    unit: 'mg/dL',
    slider: { key: 'glu', min: 40, max: 250, step: 1, label: 'Glucosa' },
    range: { min: 40, max: 250, normal: VITAL_THRESHOLDS.glu.normal, label: 'En ayunas: 70–99 mg/dL' },
  },
  sleep: {
    name: 'Sueño',
    organ: ['brain'],
    organLabel: 'Cerebro',
    mainKey: 'sleep',
    unit: 'h',
    slider: { key: 'sleep', min: 0, max: 12, step: 0.1, label: 'Horas de sueño' },
    range: { min: 0, max: 12, normal: VITAL_THRESHOLDS.sleep.normal, label: 'Normal: 7–9 h' },
  },
  mood: {
    name: 'Ánimo',
    organ: ['brain'],
    organLabel: 'Cerebro',
    mainKey: 'mood',
    unit: '/5',
    slider: { key: 'mood', min: VITAL_THRESHOLDS.mood.min, max: VITAL_THRESHOLDS.mood.max, step: 0.1, label: 'Escala de ánimo' },
    range: { min: VITAL_THRESHOLDS.mood.min, max: VITAL_THRESHOLDS.mood.max, normal: [VITAL_THRESHOLDS.mood.normalMinimum, VITAL_THRESHOLDS.mood.max], label: 'Escala: 1–5' },
  },
};

export const SIMULATOR_LIMITS = {
  hr: [30, 180],
  bp: [50, 180],
  bpDia: [40, 130],
  spo2: [70, 100],
  resp: [5, 40],
  temp: [32, 42],
  glu: [40, 250],
  sleep: [0, 12],
  mood: [1, 5],
};

export const SIMULATOR_NOISE = {
  hr: 2,
  bp: 2,
  bpDia: 1.5,
  spo2: 0.4,
  resp: 1,
  temp: 0.08,
  glu: 2,
  sleep: 0.08,
  mood: 0.08,
};

export const SIMULATOR_SCENARIOS = {
  reposo: {
    name: 'Reposo',
    values: { hr: 72, bp: 116, bpDia: 74, spo2: 98, resp: 16, temp: 36.7, glu: 92, sleep: 7.8, mood: 4 },
  },
  ejercicio: {
    name: 'Ejercicio',
    values: { hr: 124, bp: 142, bpDia: 86, spo2: 94, resp: 24, temp: 37.7, glu: 108, sleep: 6.2, mood: 3.2 },
  },
  emergencia: {
    name: 'Emergencia',
    values: { hr: 162, bp: 174, bpDia: 106, spo2: 88, resp: 28, temp: 38.2, glu: 66, sleep: 4.5, mood: 1.5 },
  },
};

export const STATUS_COLORS = {
  ok: '#5fd3a0',
  warn: '#f2b84b',
  crit: '#f26b6b',
};

export function obtenerSignosVitales() {
  return { ...SIMULATOR_SCENARIOS.reposo.values };
}

export function getVitalAssessment(id, values) {
  const normal = (term) => ({
    status: 'ok',
    term: 'NORMAL',
    meaning: `Valor dentro del rango de referencia para ${term}.`,
    recommendation: 'Continúa con el monitoreo habitual.',
  });

  if (id === 'hr') {
    const value = values.hr;
    if (value < VITAL_THRESHOLDS.hr.criticalBelow) {
      return { status: 'crit', term: 'BRADICARDIA CRÍTICA', meaning: 'Ritmo cardíaco muy bajo.', recommendation: 'Detén la actividad y solicita evaluación.' };
    }
    if (value > VITAL_THRESHOLDS.hr.criticalAbove) {
      return { status: 'crit', term: 'TAQUICARDIA CRÍTICA', meaning: 'Ritmo cardíaco muy elevado.', recommendation: 'Detén la actividad y solicita evaluación.' };
    }
    if (value < VITAL_THRESHOLDS.hr.normal[0]) {
      return { status: 'warn', term: 'BRADICARDIA', meaning: 'Ritmo por debajo de 60 lpm.', recommendation: 'Descansa y vuelve a medir en unos minutos.' };
    }
    if (value > VITAL_THRESHOLDS.hr.normal[1]) {
      return { status: 'warn', term: 'TAQUICARDIA', meaning: 'Ritmo elevado.', recommendation: 'Reposo y reevaluar en unos minutos.' };
    }
    return normal('frecuencia cardíaca');
  }

  if (id === 'bp') {
    const systolic = values.bp;
    const diastolic = values.bpDia;
    if (
      systolic < VITAL_THRESHOLDS.bp.hypotensionSystolicBelow
      || diastolic < VITAL_THRESHOLDS.bp.hypotensionDiastolicBelow
    ) {
      return { status: 'warn', term: 'HIPOTENSIÓN', meaning: 'Presión por debajo de la referencia.', recommendation: 'Hidrátate, levántate despacio y repite la medición.' };
    }
    if (
      systolic >= VITAL_THRESHOLDS.bp.hypertensionSystolicAt
      || diastolic >= VITAL_THRESHOLDS.bp.hypertensionDiastolicAt
    ) {
      return { status: 'warn', term: 'HIPERTENSIÓN', meaning: 'Presión por encima de la referencia.', recommendation: 'Descansa sentado y vuelve a medir.' };
    }
    if (
      systolic >= VITAL_THRESHOLDS.bp.normalSystolicBelow
      || diastolic >= VITAL_THRESHOLDS.bp.normalDiastolicBelow
    ) {
      return { status: 'warn', term: 'PRESIÓN ELEVADA', meaning: 'Presión fuera del intervalo normal indicado.', recommendation: 'Reposa unos minutos y repite la medición.' };
    }
    return normal('presión arterial');
  }

  if (id === 'spo2') {
    const oxygen = values.spo2;
    const respiration = values.resp;
    if (oxygen < VITAL_THRESHOLDS.spo2.criticalBelow) {
      return { status: 'crit', term: 'HIPOXEMIA CRÍTICA', meaning: 'Oxigenación por debajo de 90%.', recommendation: 'Detén la actividad y solicita ayuda.' };
    }
    if (oxygen < VITAL_THRESHOLDS.spo2.normal[0]) {
      return { status: 'warn', term: 'HIPOXEMIA', meaning: 'Oxigenación por debajo de 95%.', recommendation: 'Revisa la lectura y la ventilación; vuelve a medir.' };
    }
    if (respiration > VITAL_THRESHOLDS.spo2.respiratoryNormal[1]) {
      return { status: 'warn', term: 'TAQUIPNEA', meaning: 'Frecuencia respiratoria por encima de 20 resp/min.', recommendation: 'Pausa el esfuerzo y respira con calma.' };
    }
    if (respiration < VITAL_THRESHOLDS.spo2.respiratoryNormal[0]) {
      return { status: 'warn', term: 'BRADIPNEA', meaning: 'Frecuencia respiratoria por debajo de 12 resp/min.', recommendation: 'Confirma la lectura mientras estás en reposo.' };
    }
    return normal('oxigenación y frecuencia respiratoria');
  }

  if (id === 'temp') {
    const value = values.temp;
    if (value >= VITAL_THRESHOLDS.temp.feverAt) {
      return { status: 'warn', term: 'FIEBRE', meaning: 'Temperatura de 38 °C o más.', recommendation: 'Reduce la actividad, hidrátate y vuelve a medir.' };
    }
    if (value < VITAL_THRESHOLDS.temp.hypothermiaBelow) {
      return { status: 'warn', term: 'HIPOTERMIA', meaning: 'Temperatura por debajo de 35 °C.', recommendation: 'Abrígate y solicita una nueva medición.' };
    }
    if (value < VITAL_THRESHOLDS.temp.normal[0] || value > VITAL_THRESHOLDS.temp.normal[1]) {
      return { status: 'warn', term: 'FUERA DE RANGO', meaning: 'Temperatura fuera del intervalo de referencia.', recommendation: 'Reposa y confirma la lectura.' };
    }
    return normal('temperatura');
  }

  if (id === 'glu') {
    const value = values.glu;
    if (value < VITAL_THRESHOLDS.glu.hypoglycemiaBelow) {
      return { status: 'warn', term: 'HIPOGLUCEMIA', meaning: 'Glucosa menor de 70 mg/dL.', recommendation: 'Repite la lectura y sigue el protocolo de la misión.' };
    }
    if (value >= VITAL_THRESHOLDS.glu.hyperglycemiaAt) {
      return { status: 'warn', term: 'HIPERGLUCEMIA', meaning: 'Glucosa de 126 mg/dL o más en ayunas.', recommendation: 'Confirma que la medición sea en ayunas y vuelve a medir.' };
    }
    if (value > VITAL_THRESHOLDS.glu.normal[1]) {
      return { status: 'warn', term: 'GLUCOSA ELEVADA', meaning: 'Glucosa sobre el intervalo de referencia en ayunas.', recommendation: 'Repite la medición en condiciones de ayuno.' };
    }
    return normal('glucosa en ayunas');
  }

  if (id === 'sleep') {
    const value = values.sleep;
    if (value < VITAL_THRESHOLDS.sleep.insufficientBelow) {
      return { status: 'warn', term: 'SUEÑO INSUFICIENTE', meaning: 'Menos de 6 horas de sueño.', recommendation: 'Prioriza un periodo de descanso y mantén un horario regular.' };
    }
    if (value < VITAL_THRESHOLDS.sleep.normal[0]) {
      return { status: 'warn', term: 'SUEÑO BAJO', meaning: 'Horas de sueño por debajo de 7.', recommendation: 'Intenta ampliar el próximo periodo de descanso.' };
    }
    if (value > VITAL_THRESHOLDS.sleep.normal[1]) {
      return { status: 'warn', term: 'FUERA DE RANGO', meaning: 'Horas de sueño por encima de la referencia.', recommendation: 'Mantén un registro y un horario de descanso constante.' };
    }
    return normal('sueño');
  }

  if (id === 'mood') {
    if (values.mood <= VITAL_THRESHOLDS.mood.lowAt) {
      return { status: 'warn', term: 'ÁNIMO BAJO', meaning: 'Autoevaluación baja; no es un diagnóstico.', recommendation: 'Considera hablar con alguien de tu equipo.' };
    }
    return normal('ánimo');
  }

  return normal('el indicador');
}
