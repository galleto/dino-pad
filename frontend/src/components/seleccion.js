// seleccion.js · Zona del cuerpo seleccionada, compartida entre Monitoreo (figura y
// canales) y el gemelo del DINO PAD. Solo presentación; no toca los hooks de datos.
import { useSyncExternalStore } from 'react';

let actual = '';
const subs = new Set();

export const zonaStore = {
  get: () => actual,
  set(valor) { if (valor !== actual) { actual = valor; subs.forEach((f) => f()); } },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
};

export function useZona() {
  return [useSyncExternalStore(zonaStore.subscribe, zonaStore.get), zonaStore.set];
}
