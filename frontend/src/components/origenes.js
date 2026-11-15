// origenes.js · Los cuatro orígenes de un dato y la traducción de `source`.
// Solo presentación: services/readings.js no se modifica.
//   REAL                 viene de nuestro hardware (T1000-E; MAX30102 cuando exista)
//                        o del backend con source "live"
//   DEMO                 simulado por nosotros (simulador local, simulator.py, firmware DEMO)
//   REFERENCIA NASA      rango o dato tomado de una fuente NASA/CSA leída y citada
//   REGISTRO DEL USUARIO dato que la persona escribe a mano en este navegador
//                        (no viaja al backend)

export const ORIGENES = {
  real: {
    label: 'REAL',
    detalle: 'Medido por nuestro hardware o recibido del backend con source "live".',
  },
  demo: {
    label: 'DEMO',
    detalle: 'Simulado por nosotros. No es una medición.',
  },
  nasa: {
    label: 'REFERENCIA NASA',
    detalle: 'Tomado de una fuente NASA/CSA leída y citada en "Fuentes y ciencia".',
  },
  usuario: {
    label: 'REGISTRO DEL USUARIO',
    detalle: 'Escrito a mano en este navegador. Se guarda solo aquí; no se envía al backend.',
  },
  desconocido: {
    label: 'ORIGEN NO INDICADO',
    detalle: 'La lectura no dice de dónde viene.',
  },
};

// source del contrato ("live" | "simulated") y variantes que ya reconocía readings.js
export function origenDeSource(source) {
  if (source === 'live' || source === 'real' || source === 'hardware') return 'real';
  if (source === 'simulated' || source === 'simulator' || source === 'simulado') return 'demo';
  if (source === 'user' || source === 'usuario') return 'usuario';
  return 'desconocido';
}

export function etiquetaOrigen(source) {
  return ORIGENES[origenDeSource(source)].label;
}
