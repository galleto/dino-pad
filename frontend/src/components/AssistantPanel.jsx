import { useEffect, useRef, useState } from 'react';
import { GLOSSARY, getGlossaryEntry } from '../data/glossary';
import { useAssistant } from '../hooks/useAssistant';
import { useConnection } from '../hooks/useConnection';
import VisualRenderer from './VisualRenderer';

const QUICK_QUESTIONS = {
  alertas: ['¿Qué hago ante esta alerta?', '¿Qué dato la activó?'],
  tendencias: ['Resume esta gráfica', '¿Qué significa esta tendencia?'],
  riesgos: ['¿Cómo afecta este riesgo en el espacio?', '¿Qué indicador lo representa?'],
  historial: ['¿Qué muestra este historial?', '¿Qué significa el rango normal?'],
  monitoreo: ['¿Qué significa lo que veo aquí?', '¿Por qué cambió esta lectura?'],
  tripulacion: ['¿Qué es una línea base?', '¿Qué significan estos indicadores?'],
  emergencia: ['¿Qué hago si recibo un SOS?', '¿Qué muestra el estado del dispositivo?'],
  laboratorio: ['¿Qué significa modo simulador?', '¿Qué límites tienen estos datos?'],
  mapas: ['¿Qué muestra este mapa?', '¿Qué indicadores aparecen?'],
};

function Message({ message, screenContext, ask }) {
  const isAssistant = message.role === 'assistant';
  return (
    <article className={`assistant-message${isAssistant ? ' assistant-message-bot' : ' assistant-message-user'}`}>
      <span className="assistant-message-label">{isAssistant ? 'DINOPAD' : 'TÚ'}</span>
      <p>{typeof message.text === 'string' ? message.text : ''}</p>
      {isAssistant && message.visual && <VisualRenderer visual={message.visual} screenContext={message.screenContext || screenContext} />}
      {isAssistant && message.followUps?.length > 0 && (
        <div className="assistant-followups" aria-label="Preguntas sugeridas">
          {message.followUps.map((followUp, index) => (
            <button type="button" key={`${followUp}-${index}`} onClick={() => ask(followUp)}>
              {followUp}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export default function AssistantPanel() {
  const assistant = useAssistant();
  const data = useConnection();
  const [question, setQuestion] = useState('');
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const quickQuestions = QUICK_QUESTIONS[assistant.route] || QUICK_QUESTIONS.monitoreo;
  const offline = assistant.isOffline || data.connectionState === 'offline' || data.connectionState === 'simulator';
  const crewName = data.crew[data.activeCrewId]?.name || 'Tripulación';

  useEffect(() => {
    if (assistant.isOpen && assistant.focusVersion > 0) inputRef.current?.focus();
  }, [assistant.isOpen, assistant.focusVersion]);

  useEffect(() => {
    if (assistant.isOpen && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [assistant.messages, assistant.isOpen, assistant.isBusy]);

  const submit = (event) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || assistant.isBusy) return;
    setQuestion('');
    void assistant.ask(text);
  };

  return (
    <>
      <button
        className="assistant-launcher"
        type="button"
        onClick={() => (assistant.isOpen ? assistant.closePanel() : assistant.openPanel())}
        aria-label={assistant.isOpen ? 'Cerrar asistente educativo' : 'Abrir asistente educativo'}
        aria-expanded={assistant.isOpen}
        aria-controls="assistant-panel"
      >
        <span aria-hidden="true">✦</span>
        <span>ASISTENTE</span>
      </button>
      {assistant.isOpen && (
        <section className="assistant-panel" id="assistant-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-title">
          <header className="assistant-header">
            <div>
              <span className="eyebrow">COMPAÑERO DE MISIÓN</span>
              <h2 id="assistant-title">Asistente educativo</h2>
              <small>Contexto: {crewName} · {assistant.screenContext.pageTitle}</small>
            </div>
            <button type="button" className="assistant-close" onClick={assistant.closePanel} aria-label="Cerrar asistente">×</button>
          </header>
          {offline && (
            <div className="assistant-offline" role="status">
              Modo sin conexión: las explicaciones del glosario local siguen disponibles.
            </div>
          )}
          {assistant.storageWarning && <div className="assistant-storage-warning" role="status">No se pudo guardar la memoria local en este navegador.</div>}
          <div className="assistant-quick-questions" aria-label="Preguntas rápidas">
            {quickQuestions.map((item) => (
              <button type="button" key={item} onClick={() => void assistant.ask(item)} disabled={assistant.isBusy}>{item}</button>
            ))}
          </div>
          <div className="assistant-learned" aria-label="Conceptos ya explicados">
            <span>YA EXPLICADO</span>
            {assistant.learnedConcepts.length
              ? assistant.learnedConcepts.map((id) => (
                <button type="button" key={id} onClick={() => assistant.openTerm(id, getGlossaryEntry(id).label, getGlossaryEntry(id).definition)}>
                  {getGlossaryEntry(id).label}
                </button>
              ))
              : <small>Aún ninguno</small>}
          </div>
          <div className="assistant-messages" ref={scrollRef} aria-live="polite" aria-label="Conversación">
            {!assistant.messages.length && (
              <div className="assistant-welcome">
                <strong>¡Hola, explorador/a!</strong>
                <p>Pregúntame por lo que aparece en esta pantalla. Puedo ayudarte a entenderlo, no diagnosticarlo.</p>
              </div>
            )}
            {assistant.messages.map((message) => (
              <Message key={message.id} message={message} screenContext={assistant.screenContext} ask={assistant.ask} />
            ))}
            {assistant.isBusy && <p className="assistant-typing" role="status">Estoy revisando el contexto de la misión…</p>}
          </div>
          <form className="assistant-compose" onSubmit={submit}>
            <label className="sr-only" htmlFor="assistant-question">Escribe tu pregunta</label>
            <input
              ref={inputRef}
              id="assistant-question"
              type="text"
              maxLength={1200}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Pregunta sobre lo que ves…"
              disabled={assistant.isBusy}
            />
            <button type="submit" disabled={!question.trim() || assistant.isBusy}>Enviar</button>
          </form>
          <p className="assistant-disclaimer">Prototipo educativo; no sustituye al médico de a bordo ni a los protocolos de misión.</p>
          <span className="sr-only">{Object.keys(GLOSSARY).length} conceptos disponibles en el glosario local.</span>
        </section>
      )}
    </>
  );
}
