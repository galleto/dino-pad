// registro.js · REGISTRO DEL USUARIO: lo que la persona escribe a mano (ánimo, sueño,
// glucosa) y su revisión diaria. Se guarda SOLO en este navegador (localStorage) y no
// viaja al backend. Enviarlo sería una PROPUESTA de contrato. También calcula el anillo de
// preparación, la racha, las insignias y los recordatorios (reglas del proyecto).
import { crearStore } from './estadoMision';

export const registroStore = crearStore({}, 'dinopad-registro-v1');

export const TIPOS = {
  mood: { id: 'mood', nombre: 'Ánimo', unidad: '/10', min: 1, max: 10, paso: 1, cadaH: 24, pregunta: '¿Cómo te sientes hoy, del 1 al 10?' },
  sleep: { id: 'sleep', nombre: 'Sueño', unidad: 'h', min: 0, max: 14, paso: 0.5, cadaH: 24, pregunta: '¿Cuántas horas dormiste?' },
  glu: { id: 'glu', nombre: 'Glucosa', unidad: 'mg/dL', min: 40, max: 400, paso: 1, cadaH: 8, pregunta: '¿Qué marcó tu glucómetro?' },
};
export const TAREAS = ['mood', 'sleep', 'glu', 'revision'];
export const NOMBRE_TAREA = { mood: 'Registrar ánimo', sleep: 'Registrar sueño', glu: 'Medir glucosa', revision: 'Revisar mis indicadores' };

export const diaDe = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function agregar(crewId, tipo, valor) {
  registroStore.set((todo) => ({ ...todo, [crewId]: [...(todo[crewId] || []), { tipo, valor, ts: Date.now() }].slice(-400) }));
}
export function borrar(crewId) {
  registroStore.set((todo) => ({ ...todo, [crewId]: [] }));
}

export function tareasDelDia(entradas, dia) {
  const hechas = new Set(entradas.filter((e) => diaDe(e.ts) === dia).map((e) => e.tipo));
  return Object.fromEntries(TAREAS.map((t) => [t, hechas.has(t)]));
}
const completo = (entradas, dia) => Object.values(tareasDelDia(entradas, dia)).every(Boolean);

// Días seguidos con las 4 tareas hechas. Si hoy aún no se completa, cuenta hasta ayer.
export function racha(entradas, ahora = Date.now()) {
  let n = 0;
  let t = ahora;
  if (!completo(entradas, diaDe(t))) t -= 86400000;
  while (completo(entradas, diaDe(t)) && n < 400) { n++; t -= 86400000; }
  return n;
}

export function ultimosDias(entradas, cuantos = 7, ahora = Date.now()) {
  return Array.from({ length: cuantos }, (_, k) => {
    const ts = ahora - (cuantos - 1 - k) * 86400000;
    const tareas = tareasDelDia(entradas, diaDe(ts));
    return { dia: diaDe(ts), letra: 'DLMXJVS'[new Date(ts).getDay()], hechas: Object.values(tareas).filter(Boolean).length };
  });
}

export function recordatorios(entradas, ahora = Date.now()) {
  const lista = Object.values(TIPOS).map((t) => {
    const ultima = entradas.filter((e) => e.tipo === t.id).at(-1);
    const vence = ultima ? (t.cadaH === 24 ? diaDe(ultima.ts) !== diaDe(ahora) : ahora - ultima.ts >= t.cadaH * 3600000) : true;
    const faltaMin = ultima && !vence && t.cadaH !== 24 ? Math.ceil((ultima.ts + t.cadaH * 3600000 - ahora) / 60000) : null;
    return { id: t.id, nombre: NOMBRE_TAREA[t.id], cada: t.cadaH === 24 ? 'una vez al día' : `cada ${t.cadaH} h`, pendiente: vence, ultima, faltaMin };
  });
  const rev = entradas.filter((e) => e.tipo === 'revision').at(-1);
  lista.push({ id: 'revision', nombre: NOMBRE_TAREA.revision, cada: 'una vez al día', pendiente: !rev || diaDe(rev.ts) !== diaDe(ahora), ultima: rev, faltaMin: null });
  return lista;
}

export function insignias(entradas, ahora = Date.now()) {
  const r = racha(entradas, ahora);
  const dias = new Set(entradas.map((e) => diaDe(e.ts)));
  const mediciones = entradas.filter((e) => e.tipo !== 'revision').length;
  return [
    { id: 'primero', nombre: 'Primer registro', como: 'Anota tu primera medición', lograda: mediciones >= 1 },
    { id: 'dia', nombre: 'Día completo', como: 'Termina las 4 tareas de un día', lograda: [...dias].some((d) => completo(entradas, d)) },
    { id: 'racha3', nombre: 'Racha de 3 soles', como: '3 días completos seguidos', lograda: r >= 3 },
    { id: 'racha7', nombre: 'Semana en órbita', como: '7 días completos seguidos', lograda: r >= 7 },
    { id: 'diez', nombre: 'Bitácora viva', como: 'Llega a 10 mediciones anotadas', lograda: mediciones >= 10 },
  ];
}
