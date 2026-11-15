import { useContext } from 'react';
import { DataContext } from './DataContext.js';

export function useVitals() {
  const { latest, history, scenario, setScenario, activeCrewId, setActiveCrewId, crew, indicators } = useContext(DataContext);
  return { latest, history, scenario, setScenario, activeCrewId, setActiveCrewId, crew, indicators };
}
