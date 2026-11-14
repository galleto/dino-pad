// ============================================================
// simulator.js · Simula sensores conectados
//
// Emite lecturas con ESTE formato (el mismo que tendrían sensores reales):
// { crewId, indicatorId, value, unit, timestamp, source, quality }
//   source:  'simulated' | 'live'
//   quality: 'ok' | 'no_signal'
//
// Para usar sensores reales: reemplaza este archivo por uno que llame
// a onReading(...) con el mismo formato (WebSocket, Web Serial, fetch...).
// ============================================================
import { CREW, INDICATORS, SCENARIOS } from '../data/crewData';

const TICK_MS = 1000;
const DROPOUT_CHANCE = 0.01; // probabilidad de perder señal en una lectura

const noise = (amp) => (Math.random() - 0.5) * 2 * amp;
const round = (v, d) => Number(v.toFixed(d));

// Ritmo circadiano suave: la temperatura baja de noche (acelerado para la demo)
function circadian(indicatorId, t) {
  if (indicatorId === 'temp') return Math.sin(t / 90) * 0.15;
  if (indicatorId === 'hr') return Math.sin(t / 60) * 2;
  return 0;
}

export function createSimulator({ onReading }) {
  let timer = null;
  let t = 0;
  let scenarioId = 'normal';

  // Estado interno: valor actual y último momento de medición por tripulante e indicador
  const state = {};
  Object.values(CREW).forEach((crew) => {
    state[crew.id] = {};
    Object.values(INDICATORS).forEach((ind) => {
      const start = crew.baseline[ind.id] + (crew.bias[ind.id] || 0);
      state[crew.id][ind.id] = { value: start, lastEmit: 0 };
    });
  });

  function target(crew, ind) {
    const scenario = SCENARIOS[scenarioId];
    return (
      crew.baseline[ind.id] +
      (crew.bias[ind.id] || 0) +
      (scenario.effects[ind.id] || 0) +
      circadian(ind.id, t)
    );
  }

  function tick() {
    t += 1;
    const now = Date.now();
    Object.values(CREW).forEach((crew) => {
      Object.values(INDICATORS).forEach((ind) => {
        const s = state[crew.id][ind.id];
        // El valor interno se mueve siempre, de forma suave
        s.value += (target(crew, ind) - s.value) * ind.inertia * 0.2 + noise(ind.noise * 0.3);
        // Pero solo se "mide" según la cadencia propia del sensor
        if (now - s.lastEmit < ind.cadenceMs) return;
        s.lastEmit = now;
        const lost = Math.random() < DROPOUT_CHANCE;
        onReading({
          crewId: crew.id,
          indicatorId: ind.id,
          value: lost ? null : clamp(ind, round(s.value + noise(ind.noise), ind.decimals)),
          unit: ind.unit,
          timestamp: now,
          source: 'simulated',
          quality: lost ? 'no_signal' : 'ok',
        });
      });
    });
  }

  // Límites físicos razonables
  function clamp(ind, v) {
    if (ind.id === 'spo2') return Math.min(100, v);
    if (ind.id === 'mood') return Math.max(1, Math.min(10, v));
    if (ind.id === 'sleep') return Math.max(0, Math.min(14, v));
    return v;
  }

  return {
    start() {
      if (timer) return;
      tick(); // primera lectura inmediata
      timer = setInterval(tick, TICK_MS);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    setScenario(id) {
      if (SCENARIOS[id]) scenarioId = id;
    },
    get scenario() {
      return scenarioId;
    },
  };
}