import { useContext } from 'react';
import { DataContext } from './DataContext.js';

export function useAlerts() {
  const { alerts, acknowledgeSos } = useContext(DataContext);
  return { alerts, acknowledgeSos };
}
