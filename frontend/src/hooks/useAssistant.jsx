import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GLOSSARY, getGlossaryEntry } from '../data/glossary';
import { getRanges, getStatus } from '../services/health';
import { askAssistant, offlineAssistantResponse } from '../services/assistant';
import { AssistantContext } from './AssistantContext';
import { useConnection } from './useConnection';

const MESSAGES_KEY = 'dinopad-assistant-messages-v1';
const LEARNED_KEY = 'dinopad-learned-concepts-v1';
const SESSIONS_KEY = 'dinopad-backboard-sessions-v1';
const MAX_MESSAGES_PER_CREW = 24;
const MAX_LEARNED_PER_CREW = 30;
const PAGE_TITLES = {
  monitoreo: 'Monitoreo',
  alertas: 'Alertas',
  historial: 'Historial',
  tendencias: 'Tendencias',
  tripulacion: 'Tripulación',
  riesgos: 'Riesgos NASA',
  emergencia: 'Emergencia',
  laboratorio: 'Laboratorio',
  mapas: 'Mapas',
};

function readStorageMap(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function saveStorageMap(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function getCurrentRoute() {
  const route = window.location.hash.replace(/^#\/?/, '');
  return PAGE_TITLES[route] ? route : 'monitoreo';
}

export function AssistantProvider({ children }) {
  const data = useConnection();
  const crewId = data.activeCrewId;
  const crew = data.crew[crewId];
  const [route, setRoute] = useState(getCurrentRoute);
  const [messagesByCrew, setMessagesByCrew] = useState(() => readStorageMap(MESSAGES_KEY));
  const [learnedByCrew, setLearnedByCrew] = useState(() => readStorageMap(LEARNED_KEY));
  const [initialSessions] = useState(() => readStorageMap(SESSIONS_KEY));
  const messagesByCrewRef = useRef(messagesByCrew);
  const learnedByCrewRef = useRef(learnedByCrew);
  const sessionsByCrewRef = useRef(initialSessions);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [focusVersion, setFocusVersion] = useState(0);
  const previousScreen = useRef({ route, crewId });

  useEffect(() => {
    const onHashChange = () => setRoute(getCurrentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (previousScreen.current.route !== route || previousScreen.current.crewId !== crewId) {
      setSelectedTerm(null);
      previousScreen.current = { route, crewId };
    }
  }, [route, crewId]);

  useEffect(() => {
    const onShortcut = (event) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  const learnedConcepts = useMemo(
    () => Array.isArray(learnedByCrew[crewId]) ? learnedByCrew[crewId] : [],
    [learnedByCrew, crewId],
  );
  const messages = useMemo(
    () => Array.isArray(messagesByCrew[crewId]) ? messagesByCrew[crewId] : [],
    [messagesByCrew, crewId],
  );
  const screenContext = useMemo(() => {
    const readings = Object.values(data.indicators).map((indicator) => {
      const reading = data.latest[crewId]?.[indicator.id];
      const ranges = getRanges(indicator, crew);
      const numericValue = Number(reading?.value);
      const hasValue = reading?.value != null && reading?.quality !== 'no_signal' && Number.isFinite(numericValue);
      return {
        indicatorId: indicator.id,
        name: indicator.name,
        value: hasValue ? numericValue : null,
        unit: indicator.unit,
        status: hasValue ? getStatus(indicator, crew, reading) : 'nodata',
        rangeOk: ranges.ok,
        rangeWarn: ranges.warn,
        history: (data.history[crewId]?.[indicator.id] || [])
          .filter((item) => item?.quality !== 'no_signal' && item?.value != null && Number.isFinite(Number(item.value)))
          .slice(-30)
          .map((item) => Number(item.value)),
      };
    });
    const alerts = data.alerts
      .filter((alert) => alert.crewId === crewId)
      .slice(0, 12)
      .map((alert) => ({
        level: alert.level,
        title: String(alert.title || 'Alerta').slice(0, 128),
        message: String(alert.message || '').slice(0, 500),
        indicatorId: data.indicators[alert.indicatorId] ? alert.indicatorId : null,
      }));
    const entry = selectedTerm ? getGlossaryEntry(selectedTerm.id) : null;
    return {
      route,
      pageTitle: PAGE_TITLES[route] || 'Dinopad',
      crewId,
      crewName: crew?.name || crewId,
      readings,
      alerts,
      selectedTerm: selectedTerm?.id || null,
      termLabel: selectedTerm?.label || entry?.label || null,
      termDefinition: selectedTerm?.definition || entry?.definition || null,
    };
  }, [data.indicators, data.latest, data.history, data.alerts, crewId, crew, route, selectedTerm]);

  const appendMessage = useCallback((message) => {
    const entry = { ...message, id: `${Date.now()}-${Math.random().toString(16).slice(2)}` };
    const current = messagesByCrewRef.current;
    const previous = Array.isArray(current[crewId]) ? current[crewId] : [];
    const updated = { ...current, [crewId]: [...previous, entry].slice(-MAX_MESSAGES_PER_CREW) };
    messagesByCrewRef.current = updated;
    setMessagesByCrew(updated);
    if (!saveStorageMap(MESSAGES_KEY, updated)) setStorageWarning(true);
  }, [crewId]);

  const markLearned = useCallback((conceptId) => {
    if (!GLOSSARY[conceptId]) return;
    const current = learnedByCrewRef.current;
    const previous = Array.isArray(current[crewId]) ? current[crewId] : [];
    const updated = {
      ...current,
      [crewId]: [...new Set([...previous, conceptId])].slice(-MAX_LEARNED_PER_CREW),
    };
    learnedByCrewRef.current = updated;
    setLearnedByCrew(updated);
    if (!saveStorageMap(LEARNED_KEY, updated)) setStorageWarning(true);
  }, [crewId]);

  const openTerm = useCallback((id, label, definition) => {
    const entry = getGlossaryEntry(id);
    setSelectedTerm({ id, label: label || entry.label, definition: definition || entry.definition });
    setIsOpen(true);
    markLearned(id);
  }, [markLearned]);

  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);
  const focusComposer = useCallback(() => {
    setIsOpen(true);
    setFocusVersion((version) => version + 1);
  }, []);

  const ask = useCallback(async (question, options = {}) => {
    const cleanQuestion = String(question || '').trim().slice(0, 1200);
    if (!cleanQuestion || isBusy) return;
    setIsOpen(true);
    setIsBusy(true);
    setIsOffline(false);
    appendMessage({ role: 'user', text: cleanQuestion });

    const term = options.termId ? {
      id: options.termId,
      label: getGlossaryEntry(options.termId).label,
      definition: getGlossaryEntry(options.termId).definition,
    } : selectedTerm;
    const context = term ? {
      ...screenContext,
      selectedTerm: term.id,
      termLabel: term.label,
      termDefinition: term.definition,
    } : screenContext;
    let response;
    let offline = false;

    try {
      if (data.connectionState !== 'live' && data.connectionState !== 'checking') {
        throw new Error('Backend no disponible.');
      }
      response = await askAssistant({
        question: cleanQuestion,
        screenContext: context,
        learnedConcepts: Array.isArray(learnedByCrewRef.current[crewId]) ? learnedByCrewRef.current[crewId] : [],
        assistantId: sessionsByCrewRef.current[crewId]?.assistantId || null,
        threadId: sessionsByCrewRef.current[crewId]?.threadId || null,
        expanded: options.expanded === true,
        visualRequest: options.visualRequest === true,
      });
    } catch {
      response = offlineAssistantResponse(cleanQuestion, context, options);
      offline = true;
      setIsOffline(true);
    }

    if (response.assistantId && response.threadId) {
      const updated = {
        ...sessionsByCrewRef.current,
        [crewId]: { assistantId: response.assistantId, threadId: response.threadId },
      };
      sessionsByCrewRef.current = updated;
      if (!saveStorageMap(SESSIONS_KEY, updated)) setStorageWarning(true);
    }
    if (response.conceptId) markLearned(response.conceptId);
    appendMessage({
      role: 'assistant',
      text: response.answer,
      conceptId: response.conceptId,
      relatedConcepts: response.relatedConcepts,
      visual: response.visual,
      followUps: response.followUps,
      screenContext: context,
      source: offline ? 'local' : 'gemini',
      backboardAvailable: response.backboardAvailable,
    });
    setIsBusy(false);
  }, [
    isBusy,
    appendMessage,
    selectedTerm,
    screenContext,
    data.connectionState,
    crewId,
    markLearned,
  ]);

  const value = useMemo(() => ({
    route,
    crewId,
    messages,
    learnedConcepts,
    selectedTerm,
    screenContext,
    isOpen,
    isBusy,
    isOffline,
    storageWarning,
    focusVersion,
    openTerm,
    openPanel,
    closePanel,
    focusComposer,
    ask,
  }), [
    route, crewId, messages, learnedConcepts, selectedTerm, screenContext, isOpen,
    isBusy, isOffline, storageWarning, focusVersion, openTerm, openPanel, closePanel,
    focusComposer, ask,
  ]);

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
