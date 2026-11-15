import { useId, useState } from 'react';
import { getGlossaryEntry } from '../data/glossary';
import { useAssistant } from '../hooks/useAssistant';
import { useConnection } from '../hooks/useConnection';
import { getRanges } from '../services/health';

export default function Term({ id, children, compact = false }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const popoverId = useId();
  const assistant = useAssistant();
  const data = useConnection();
  const entry = getGlossaryEntry(id);
  const indicator = data.indicators[id];
  const crew = data.crew[data.activeCrewId];
  const ranges = indicator ? getRanges(indicator, crew) : null;
  const label = typeof children === 'string' ? children : entry.label;

  const open = () => {
    setIsExpanded(true);
    assistant.openTerm(id, label, entry.definition);
  };
  const askForMore = () => assistant.ask(`Explícamelo más: ${entry.label}.`, { expanded: true, termId: id });
  const showVisual = () => assistant.ask(`Muéstrame visualmente ${entry.label}.`, { visualRequest: true, termId: id });

  return (
    <span className={`term-wrap${compact ? ' term-wrap-compact' : ''}`}>
      <button
        className={`term-trigger${compact ? ' term-trigger-compact' : ''}`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isExpanded}
        aria-controls={popoverId}
        onClick={open}
      >
        {compact ? <span aria-hidden="true">i</span> : children || entry.label}
        <span className="sr-only">{compact ? `Qué significa ${entry.label}` : ''}</span>
      </button>
      {isExpanded && (
        <span className="term-popover" id={popoverId} role="dialog" aria-label={`Explicación de ${entry.label}`}>
          <span className="term-popover-head">
            <strong>{entry.label}</strong>
            <button type="button" className="term-close" onClick={() => setIsExpanded(false)} aria-label="Cerrar explicación">×</button>
          </span>
          <span className="term-definition">{entry.definition}</span>
          {ranges && <span className="term-range">Rango normal de referencia: {ranges.ok[0]}–{ranges.ok[1]} {indicator.unit}.</span>}
          <span className="term-actions">
            <button type="button" onClick={askForMore}>Explícamelo más</button>
            <button type="button" onClick={showVisual}>Muéstramelo</button>
            <button type="button" onClick={assistant.focusComposer}>Preguntar algo</button>
          </span>
        </span>
      )}
    </span>
  );
}
