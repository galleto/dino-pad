// ============================================================
// useVitals.js · Conecta el simulador con React
//
// Uso en App.jsx:
//   const { latest, history, setScenario, scenario, connected } = useVitals();
//   latest['comandante'].hr   -> última lectura de frecuencia cardíaca
//   history['comandante'].hr  -> arreglo con las últimas lecturas (para gráficas)
//
// Los componentes solo leen este estado: no saben si los datos son simulados o reales.
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { createSimulator } from '../services/simulator';

const MAX_HISTORY = 40;

export function useVitals() {
  const [latest, setLatest] = useState({});
  const [history, setHistory] = useState({});
  const [scenario, setScenarioState] = useState('normal');
  const [connected, setConnected] = useState(false);
  const simRef = useRef(null);

  useEffect(() => {
    const onReading = (r) => {
      setLatest((prev) => ({
        ...prev,
        [r.crewId]: { ...prev[r.crewId], [r.indicatorId]: r },
      }));
      setHistory((prev) => {
        const crewHist = prev[r.crewId] || {};
        const list = [...(crewHist[r.indicatorId] || []), r].slice(-MAX_HISTORY);
        return { ...prev, [r.crewId]: { ...crewHist, [r.indicatorId]: list } };
      });
    };

    const sim = createSimulator({ onReading });
    simRef.current = sim;
    sim.start();
    setConnected(true);

    // Limpieza: evita lecturas duplicadas si el componente se vuelve a montar
    return () => {
      sim.stop();
      setConnected(false);
    };
  }, []);

  const setScenario = useCallback((id) => {
    simRef.current?.setScenario(id);
    setScenarioState(id);
  }, []);

  return { latest, history, scenario, setScenario, connected };
}........................................