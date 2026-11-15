import { useContext } from 'react';
import { AssistantContext } from './AssistantContext';

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) throw new Error('useAssistant debe usarse dentro de AssistantProvider.');
  return context;
}
