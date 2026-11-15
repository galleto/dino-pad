// maquina.js · Lógica del DINO PAD portada a JS desde firmware/dinopad_pipboy
// (rama pines-botones, solo lectura): botones.cpp, demo.h, posicion_demo.h,
// simulador_vital.h, mensajes.h y manejar() de dinopad_pipboy.ino.
// Sin React ni DOM: se puede probar con Node.

export const PESTANAS = ['ESTADO', 'AMBIENTE', 'TRACK', 'VITAL', 'MENS'];
export const P = { ESTADO: 0, AMBIENTE: 1, TRACK: 2, VITAL: 3, MENS: 4 };
export const MENSAJES = ['Estoy bien', 'Recibido, entendido', 'Voy en camino', 'Regreso al habitat', 'Espero instrucciones', 'Bateria baja', 'Suministros bajos', 'Necesito ayuda medica'];

// ---------- botones.cpp ----------
export const TIEMPOS = { antirreboteMs: 30, rojoLargoMs: 800, sosMs: 3000 };
const NEGRO = 0;
const BLANCO = 1;
const ROJO = 2;

export class Botones {
  constructor(t = TIEMPOS) {
    this.t = t;
    this.b = [0, 1, 2].map(() => ({ estable: false, crudo: false, cambioMs: 0, presionMs: 0 }));
    this.comboUsado = false;
    this.comboActivo = false;
    this.comboInicioMs = 0;
    this.sosDisparado = false;
    this.rojoLargoDisparado = false;
    this.cola = [];
  }

  alPresionar(i, ms) {
    this.b[i].presionMs = ms;
    if (i === ROJO) this.rojoLargoDisparado = false;
    if ((i === NEGRO || i === BLANCO) && this.b[NEGRO].estable && this.b[BLANCO].estable) {
      this.comboUsado = true;
      this.comboActivo = true;
      this.comboInicioMs = ms;
      this.sosDisparado = false;
    }
  }

  alSoltar(i) {
    if (i === ROJO) {
      if (!this.rojoLargoDisparado) this.cola.push('SELECCIONAR');
      return;
    }
    this.comboActivo = false;
    if (!this.comboUsado) this.cola.push(i === NEGRO ? 'ANTERIOR' : 'SIGUIENTE');
    if (!this.b[NEGRO].estable && !this.b[BLANCO].estable) this.comboUsado = false;
  }

  // Llamar seguido. true = botón presionado.
  actualizar(negro, blanco, rojo, ms) {
    const crudo = [negro, blanco, rojo];
    for (let i = 0; i < 3; i++) {
      const b = this.b[i];
      if (crudo[i] !== b.crudo) { b.crudo = crudo[i]; b.cambioMs = ms; }
      if (b.crudo !== b.estable && ms - b.cambioMs >= this.t.antirreboteMs) {
        b.estable = b.crudo;
        if (b.estable) this.alPresionar(i, ms);
        else this.alSoltar(i);
      }
    }
    if (this.b[ROJO].estable && !this.rojoLargoDisparado && ms - this.b[ROJO].presionMs >= this.t.rojoLargoMs) {
      this.rojoLargoDisparado = true;
      this.cola.push('VOLVER');
    }
    if (this.comboActivo && !this.sosDisparado && ms - this.comboInicioMs >= this.t.sosMs) {
      this.sosDisparado = true;
      this.cola.push('SOS');
    }
  }

  siguienteEvento() { return this.cola.shift() || null; }

  // -1 si no se sostiene la combinación; 0..1 mientras se sostiene
  progresoSos(ms) {
    if (!this.comboActivo || this.sosDisparado) return -1;
    return Math.min(1, (ms - this.comboInicioMs) / this.t.sosMs);
  }
}

// ---------- demo.h ----------
export const GUION_DEMO = [
  ['SELECCIONAR', 8000], ['VOLVER', 1500], ['SIGUIENTE', 1500],
  ['SELECCIONAR', 8000], ['VOLVER', 1500], ['SIGUIENTE', 1500],
  ['SELECCIONAR', 6000], ['SIGUIENTE', 5000], ['ANTERIOR', 2000], ['VOLVER', 1500], ['SIGUIENTE', 1500],
  ['SELECCIONAR', 10000], ['VOLVER', 1500], ['SIGUIENTE', 1500],
  ['SELECCIONAR', 2000], ['SIGUIENTE', 1500], ['ANTERIOR', 1500], ['SELECCIONAR', 4000], ['VOLVER', 1500], ['SIGUIENTE', 1500],
  ['SOS', 4000], ['SELECCIONAR', 3000],
];

export class Demo {
  constructor() { this.i = 0; this.proximoMs = 0; }
  empezarEn(ms) { this.proximoMs = ms; }
  siguiente(ms) {
    if (ms < this.proximoMs) return null;
    const [evento, espera] = GUION_DEMO[this.i];
    this.i = (this.i + 1) % GUION_DEMO.length;
    this.proximoMs = ms + espera;
    return evento;
  }
}

// ---------- manejar() de dinopad_pipboy.ino ----------
// En la web ENVIAR_MENSAJE siempre es false: el gemelo nunca envía nada por radio.
export function estadoInicial() {
  return { pestana: 0, modo: 'MENU', modoAntesSos: 'MENU', pie: 'listo', eventoDeDemo: false, cursorMens: 0, paginaTrack: 0 };
}

export function manejar(e, evento, desdeDemo = false) {
  const s = { ...e, eventoDeDemo: desdeDemo };
  const n = PESTANAS.length;
  if (evento === 'SOS') {
    if (s.modo !== 'SOS') s.modoAntesSos = s.modo;
    s.modo = 'SOS';
    return s;
  }
  if (s.modo === 'SOS') {
    if (evento === 'SELECCIONAR' || evento === 'VOLVER') { s.modo = s.modoAntesSos; s.pie = 'SOS cerrado'; }
    return s;
  }
  if (s.modo === 'MENU') {
    if (evento === 'ANTERIOR') s.pestana = (s.pestana + n - 1) % n;
    else if (evento === 'SIGUIENTE') s.pestana = (s.pestana + 1) % n;
    if (evento === 'ANTERIOR' || evento === 'SIGUIENTE') s.paginaTrack = 0;
    else if (evento === 'SELECCIONAR') s.modo = 'DENTRO';
    else if (evento === 'VOLVER') { s.pie = 'VOLVER (ya en el menu)'; return s; }
    s.pie = evento;
    return s;
  }
  // DENTRO
  if (evento === 'VOLVER') { s.modo = 'MENU'; s.pie = evento; return s; }
  const mueve = evento === 'ANTERIOR' || evento === 'SIGUIENTE';
  if (s.pestana === P.TRACK && mueve) {
    s.paginaTrack = Math.max(0, s.paginaTrack + (evento === 'SIGUIENTE' ? 1 : -1));
    s.pie = evento === 'SIGUIENTE' ? 'pagina siguiente' : 'pagina anterior';
  } else if (s.pestana === P.MENS && mueve) {
    s.cursorMens = (s.cursorMens + MENSAJES.length + (evento === 'SIGUIENTE' ? 1 : -1)) % MENSAJES.length;
    s.pie = MENSAJES[s.cursorMens];
  } else if (s.pestana === P.MENS && evento === 'SELECCIONAR') {
    s.pie = desdeDemo ? `ENVIO SIMULADO: ${MENSAJES[s.cursorMens]}` : `NO ENVIADO (ENVIAR=false): ${MENSAJES[s.cursorMens]}`;
  } else {
    s.pie = `${evento} (sin accion aqui todavia)`;
  }
  return s;
}

// ---------- posicion_demo.h ----------
export const POSDEMO = {
  BASE_LAT: 18.44,
  BASE_LON: 77.45,
  NOMBRE_BASE: 'BASE JEZERO, MARTE',
  RADIO_MARTE_M: 3389500,
  TRIPULANTES: [
    { corto: 'BOTA', crewId: 'botanico', norteM: 40, esteM: -30, ampNorteM: 30, ampEsteM: 50, periodoS: 600 },
    { corto: 'INGE', crewId: 'ingeniero', norteM: -40, esteM: 300, ampNorteM: 25, ampEsteM: 120, periodoS: 900 },
  ],
};

export function desplazamiento(i, s) {
  const t = POSDEMO.TRIPULANTES[i];
  const f = (2 * Math.PI * (s % t.periodoS)) / t.periodoS;
  return { norte: t.norteM + t.ampNorteM * Math.sin(f), este: t.esteM + t.ampEsteM * Math.sin(f + 1) };
}

export function aGrados(norte, este) {
  return {
    lat: POSDEMO.BASE_LAT + ((norte / POSDEMO.RADIO_MARTE_M) * 180) / Math.PI,
    lon: POSDEMO.BASE_LON + ((este / (POSDEMO.RADIO_MARTE_M * Math.cos((POSDEMO.BASE_LAT * Math.PI) / 180))) * 180) / Math.PI,
  };
}

export const distanciaM = (norte, este) => Math.hypot(norte, este);

export function rumbo(norte, este) {
  let g = (Math.atan2(este, norte) * 180) / Math.PI;
  if (g < 0) g += 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.floor((g + 22.5) / 45) % 8];
}

// ---------- vitales.h + simulador_vital.h ----------
export const RANGO_HR = { okMin: 50, okMax: 90, warnMin: 40, warnMax: 110 };
export const RANGO_SPO2 = { okMin: 95, okMax: 100, warnMin: 90, warnMax: 100 };

export function clasificar(v, r) {
  if (v >= r.okMin && v <= r.okMax) return 'NORMAL';
  if (v >= r.warnMin && v <= r.warnMax) return 'ATENCION';
  return 'CRITICO';
}

export class SimuladorVital {
  constructor() { this.hay = false; this.ultimoMs = 0; this.hr = 74; this.spo2 = 98; this.semilla = 12345; }
  ruido(amp) {
    this.semilla = (Math.imul(this.semilla, 1664525) + 1013904223) >>> 0;
    return ((this.semilla >>> 8) / 16777216 - 0.5) * 2 * amp;
  }
  // Devuelve una muestra nueva cada 2000 ms, o null
  leer(ms) {
    if (this.hay && ms - this.ultimoMs < 2000) return null;
    this.hay = true;
    this.ultimoMs = ms;
    const s = Math.floor(ms / 1000);
    const esfuerzo = s % 180 >= 120 && s % 180 < 150;
    const objHr = esfuerzo ? 104 : 74 + 2 * Math.sin(s / 60);
    const objSpo2 = esfuerzo ? 93 : 98;
    this.hr += (objHr - this.hr) * 0.25 + this.ruido(1.5);
    this.spo2 += (objSpo2 - this.spo2) * 0.2 + this.ruido(0.3);
    if (this.spo2 > 100) this.spo2 = 100;
    const acotar = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    return { ms, hr: Math.round(acotar(this.hr, 55, 108)), spo2: Math.round(acotar(this.spo2, 91, 100)) };
  }
}
