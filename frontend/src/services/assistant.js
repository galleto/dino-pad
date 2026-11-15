import { INDICATORS } from '../data/crewData';
import { getGlossaryEntry, GLOSSARY } from '../data/glossary';
import { API_URL } from './api';

const VISUAL_TYPES = new Set(['gauge', 'range', 'trend', 'diagram', 'none']);

export function validateAssistantResponse(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.answer !== 'string' || !payload.answer.trim()) {
    throw new Error('El asistente devolvió una respuesta inválida.');
  }

  const rawVisual = payload.visual && typeof payload.visual === 'object' ? payload.visual : {};
  let visual = { type: 'none' };
  if (VISUAL_TYPES.has(rawVisual.type)) {
    if (['gauge', 'range', 'trend'].includes(rawVisual.type) && INDICATORS[rawVisual.indicatorId]) {
      visual = { type: rawVisual.type, indicatorId: rawVisual.indicatorId };
    } else if (rawVisual.type === 'diagram' && GLOSSARY[rawVisual.conceptId]?.diagram) {
      visual = { type: 'diagram', conceptId: rawVisual.conceptId };
    } else if (rawVisual.type === 'none') {
      visual = { type: 'none' };
    }
  }

  const listOfStrings = (items, maxItems) => (
    Array.isArray(items) ? items.filter((item) => typeof item === 'string').slice(0, maxItems) : []
  );
  return {
    answer: payload.answer.trim().slice(0, 900),
    conceptId: typeof payload.conceptId === 'string' && GLOSSARY[payload.conceptId] ? payload.conceptId : null,
    relatedConcepts: listOfStrings(payload.relatedConcepts, 5).filter((id) => Boolean(GLOSSARY[id])),
    visual,
    followUps: listOfStrings(payload.followUps, 4),
    assistantId: typeof payload.assistantId === 'string' ? payload.assistantId : null,
    threadId: typeof payload.threadId === 'string' ? payload.threadId : null,
    backboardAvailable: payload.backboardAvailable === true,
    source: 'gemini',
  };
}

export async function askAssistant(payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${API_URL}/api/assistant`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let detail = `El asistente respondió con HTTP ${response.status}.`;
      try {
        const errorBody = await response.json();
        if (typeof errorBody.detail === 'string') detail = errorBody.detail;
      } catch {
        // El cuerpo de error no siempre es JSON.
      }
      throw new Error(detail);
    }
    return validateAssistantResponse(await response.json());
  } finally {
    window.clearTimeout(timeout);
  }
}

export function offlineAssistantResponse(question, screenContext, options = {}) {
  const normalizedQuestion = String(question || '').toLocaleLowerCase('es');
  const matchedConcept = screenContext?.selectedTerm
    ? screenContext.selectedTerm
    : Object.entries(GLOSSARY).find(([id, item]) => (
      normalizedQuestion.includes(id) || normalizedQuestion.includes(item.label.toLocaleLowerCase('es'))
    ))?.[0];
  const entry = getGlossaryEntry(matchedConcept);
  const definition = screenContext?.selectedTerm ? screenContext.termDefinition || entry.definition : entry.definition;
  const hasCriticalReading = screenContext?.readings?.some((reading) => reading.status === 'crit');
  const selectedReading = screenContext?.readings?.find((reading) => reading.indicatorId === matchedConcept);
  let visual = { type: 'none' };
  if (options.visualRequest === true && entry.diagram?.length) {
    visual = { type: 'diagram', conceptId: matchedConcept };
  } else if (options.visualRequest === true && selectedReading) {
    const asksTrend = /tendencia|gr[aá]fica|historial/i.test(question);
    visual = {
      type: asksTrend && selectedReading.history?.length > 1 ? 'trend' : 'range',
      indicatorId: matchedConcept,
    };
  }
  const answer = matchedConcept
    ? `${definition} Estoy en modo sin conexión; esta explicación viene del glosario local.${hasCriticalReading ? ' Ante una lectura crítica, consulta al médico de a bordo.' : ''}`
    : `Estoy en modo sin conexión y no puedo consultar la IA. Pulsa un término subrayado para ver su explicación local.${hasCriticalReading ? ' Ante una lectura crítica, consulta al médico de a bordo.' : ''}`;
  return {
    answer,
    conceptId: matchedConcept && GLOSSARY[matchedConcept] ? matchedConcept : null,
    relatedConcepts: entry.related || [],
    visual,
    followUps: [],
    assistantId: null,
    threadId: null,
    backboardAvailable: false,
    source: 'local',
  };
}
