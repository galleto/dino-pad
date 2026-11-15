// estadoMision.js · Estado de presentación compartido (no toca hooks ni servicios):
// modo tormenta solar, entorno de misión, sonido y modo presentación.
import { useSyncExternalStore } from 'react';

function crearStore(inicial, clave) {
  let valor = inicial;
  if (clave) {
    try { const g = JSON.parse(localStorage.getItem(clave) || 'null'); if (g !== null) valor = g; } catch { /* sin almacenamiento */ }
  }
  const subs = new Set();
  const store = {
    get: () => valor,
    set(nuevo) {
      valor = typeof nuevo === 'function' ? nuevo(valor) : nuevo;
      if (clave) { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ } }
      subs.forEach((f) => f());
    },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
  return store;
}

export function useStore(store) {
  return [useSyncExternalStore(store.subscribe, store.get), store.set];
}

// Tormenta solar: null si no está activa; { origen: 'demo' | 'alerta', inicio, alertaId }
export const tormentaStore = crearStore(null);
// Entorno de misión elegido (se recuerda en este navegador)
export const entornoStore = crearStore('marte', 'dinopad-entorno');
// Sonidos de interfaz: apagados por defecto
export const sonidoStore = crearStore(false, 'dinopad-sonido');
// Modo presentación: null o índice del paso actual
export const presentacionStore = crearStore(null);

export const DURACION_REFUGIO_S = 600;   // cuenta regresiva del simulacro (regla del proyecto)
