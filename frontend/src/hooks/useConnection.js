import { useContext } from 'react';
import { DataContext } from './DataContext.js';

export function useConnection() {
  return useContext(DataContext);
}
