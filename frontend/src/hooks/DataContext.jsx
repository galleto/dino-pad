import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CREW, INDICATORS, SCENARIOS } from '../data/crewData';
import { api, normalizeCrew, WS_URL } from '../services/api';
import { buildAlerts } from '../services/health';
import { speakAlert, supportsSpeech } from '../services/speech';
import { createSimulator } from '../services/simulator';
import { DataContext } from './DataContext.js';

const CACHE_KEY = 'dinopad-cache-v1';
const MAX_CACHE_READINGS = 140;
const MAX_CACHE_ALERTS = 100;
const emptyCache = { latest: {}, history: {}, alerts: [] };

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? { ...emptyCache, ...parsed } : emptyCache;
  } catch {
    return emptyCache;
  }
}

function valuesForCrew(payload, crewId) {
  if (Array.isArray(payload)) return payload;
  if (payload?.[crewId] && typeof payload[crewId] === 'object') return payload[crewId];
  return payload || {};
}

export function DataProvider({ children }) {
  const [initialCache] = useState(readCache);
  const [crewData, setCrewData] = useState({ crew: CREW, indicators: INDICATORS, scenarios: SCENARIOS });
  const [latest, setLatest] = useState(initialCache.latest || {});
  const [history, setHistory] = useState(initialCache.history || {});
  const [alertsById, setAlertsById] = useState(() => Object.fromEntries((initialCache.alerts || []).map((alert) => [alert.id, alert])));
  const [connectionState, setConnectionState] = useState('checking');
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  const [forceOffline, setForceOffline] = useState(false);
  const [activeCrewId, setActiveCrewState] = useState(() => localStorage.getItem('dinopad-active-crew') || 'comandante');
  const [scenario, setScenarioState] = useState('normal');
  const [synchronized, setSynchronized] = useState(false);
  const [cacheWarning, setCacheWarning] = useState('');
  const [lastCachedAt, setLastCachedAt] = useState(initialCache.savedAt || null);
  const [readCriticalVoice, setReadCriticalVoice] = useState(() => localStorage.getItem('dinopad-voice-critical') === 'true');
  const [acknowledgedSos, setAcknowledgedSos] = useState(() => localStorage.getItem('dinopad-sos-ack') || '');
  const simRef = useRef(null);
  const previousBackendRef = useRef(false);
  const mountedRef = useRef(true);
  const latestRef = useRef(initialCache.latest || {});
  const historyRef = useRef(initialCache.history || {});
  const alertsRef = useRef(Object.fromEntries((initialCache.alerts || []).map((alert) => [alert.id, alert])));
  const saveCache = useCallback((nextLatest, nextHistory, nextAlerts) => {
    try {
      const readings = Object.values(nextHistory).flatMap((crewHistory) => Object.values(crewHistory).flat());
      const boundedHistory = {};
      readings.slice(-MAX_CACHE_READINGS).forEach((reading) => {
        boundedHistory[reading.crewId] ||= {};
        boundedHistory[reading.crewId][reading.indicatorId] ||= [];
        boundedHistory[reading.crewId][reading.indicatorId].push(reading);
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        latest: nextLatest,
        history: boundedHistory,
        alerts: Object.values(nextAlerts).slice(-MAX_CACHE_ALERTS),
        savedAt: Date.now(),
      }));
      setLastCachedAt(Date.now());
      setCacheWarning('');
    } catch {
      setCacheWarning('No se pudo actualizar la caché local del navegador.');
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const receiveReading = useCallback((reading) => {
    if (!reading?.crewId || !reading?.indicatorId) return;
    const nextLatest = { ...latestRef.current, [reading.crewId]: { ...latestRef.current[reading.crewId], [reading.indicatorId]: reading } };
    const crewHistory = historyRef.current[reading.crewId] || {};
    const existing = crewHistory[reading.indicatorId] || [];
    const nextHistory = { ...historyRef.current, [reading.crewId]: { ...crewHistory, [reading.indicatorId]: [...existing, reading].slice(-100) } };
    latestRef.current = nextLatest;
    historyRef.current = nextHistory;
    setLatest(nextLatest);
    setHistory(nextHistory);
    saveCache(nextLatest, nextHistory, alertsRef.current);
  }, [saveCache]);

  const receiveAlert = useCallback((alert) => {
    if (!alert?.id) return;
    const previousAlert = alertsRef.current[alert.id];
    const receivedAt = previousAlert?._receivedAt ?? (Object.hasOwn(alert, '_receivedAt') ? alert._receivedAt : Date.now());
    const nextAlerts = { ...alertsRef.current, [alert.id]: { ...previousAlert, ...alert, _receivedAt: receivedAt } };
    alertsRef.current = nextAlerts;
    setAlertsById(nextAlerts);
    saveCache(latestRef.current, historyRef.current, nextAlerts);
  }, [saveCache]);

  const refreshBackend = useCallback(async () => {
    try {
      const rawCrew = await api.crew();
      if (!mountedRef.current) return;
      const normalized = normalizeCrew(rawCrew);
      if (!Object.keys(normalized.crew || {}).length) throw new Error('La API no devolvió perfiles de tripulación.');
      setCrewData({ ...normalized, indicators: rawCrew.indicators || INDICATORS, scenarios: rawCrew.scenarios || SCENARIOS });
      const crewIds = Object.keys(rawCrew.crew || CREW);
      const results = await Promise.all(crewIds.map(async (crewId) => {
        const [latestResult, alertResult] = await Promise.all([
          api.latest(crewId),
          api.alerts(crewId, 100),
        ]);
        return { crewId, latestResult, alertResult };
      }));
      if (!mountedRef.current) return;
      results.forEach(({ crewId, latestResult, alertResult }) => {
        const byIndicator = valuesForCrew(latestResult, crewId);
        Object.entries(byIndicator).forEach(([indicatorId, reading]) => {
          if (reading && typeof reading === 'object') receiveReading({ ...reading, crewId, indicatorId, source: reading.source || 'unknown' });
        });
        (Array.isArray(alertResult) ? alertResult : alertResult?.alerts || []).forEach((alert) => receiveAlert({ ...alert, _receivedAt: null }));
      });
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
    }
  }, [receiveAlert, receiveReading]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    let timer;
    const check = async () => {
      if (!active) return;
      if (forceOffline) {
        previousBackendRef.current = false;
        timer = window.setTimeout(check, 5000);
        return;
      }
      if (!browserOnline) {
        previousBackendRef.current = false;
        setConnectionState('offline');
        timer = window.setTimeout(check, 5000);
        return;
      }
      try {
        await api.health();
        if (!active) return;
        if (!previousBackendRef.current) {
          await refreshBackend();
          if (!active) return;
          previousBackendRef.current = true;
          setSynchronized(true);
          window.setTimeout(() => setSynchronized(false), 3500);
        }
        setConnectionState('live');
      } catch {
        previousBackendRef.current = false;
        setConnectionState('simulator');
      }
      timer = window.setTimeout(check, 5000);
    };
    check();
    return () => {
      active = false;
      mountedRef.current = false;
      window.clearTimeout(timer);
    };
  }, [refreshBackend, forceOffline, browserOnline]);

  useEffect(() => {
    if (connectionState !== 'live' || forceOffline) return undefined;
    let stopped = false;
    let sockets = [];
    let retryTimers = [];
    const connectSocket = (path, handler) => {
      if (stopped) return;
      const socket = new WebSocket(`${WS_URL}${path}`);
      socket.onmessage = (event) => {
        try { handler(JSON.parse(event.data)); } catch { /* Ignora mensajes no JSON. */ }
      };
      socket.onclose = () => {
        sockets = sockets.filter((item) => item !== socket);
        if (!stopped) retryTimers.push(window.setTimeout(() => connectSocket(path, handler), 5000));
      };
      socket.onerror = () => socket.close();
      sockets.push(socket);
    };
    connectSocket('/ws/vitals', receiveReading);
    connectSocket('/ws/alerts', receiveAlert);
    return () => {
      stopped = true;
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      sockets.forEach((socket) => socket.close());
    };
  }, [connectionState, forceOffline, receiveAlert, receiveReading]);

  useEffect(() => {
    const mode = forceOffline ? 'offline' : connectionState;
    if (mode !== 'simulator') {
      simRef.current?.stop();
      simRef.current = null;
      return undefined;
    }
    const simulator = createSimulator({ onReading: receiveReading });
    simRef.current = simulator;
    simulator.setScenario(scenario);
    simulator.start();
    return () => {
      simulator.stop();
      if (simRef.current === simulator) simRef.current = null;
    };
  }, [connectionState, forceOffline, receiveReading, scenario]);

  const setScenario = useCallback((id) => {
    if ((crewData.scenarios || SCENARIOS)[id]) {
      simRef.current?.setScenario(id);
      setScenarioState(id);
    }
  }, [crewData.scenarios]);
  const setActiveCrewId = useCallback((id) => {
    setActiveCrewState(id);
    localStorage.setItem('dinopad-active-crew', id);
  }, []);
  const acknowledgeSos = useCallback((id) => {
    setAcknowledgedSos(id);
    localStorage.setItem('dinopad-sos-ack', id);
  }, []);

  const alerts = useMemo(() => {
    const merged = Object.values(alertsById);
    Object.values(crewData.crew || CREW).flatMap((person) => buildAlerts(person, latest[person.id] || {})).forEach((alert) => {
      if (!merged.some((item) => item.crewId === alert.crewId && item.indicatorId === alert.indicatorId && item.level === alert.level)) merged.push(alert);
    });
    return merged.sort((a, b) => {
    const priority = { critical: 0, warning: 1, info: 2 };
    return (priority[a.level] ?? 3) - (priority[b.level] ?? 3) || Number(b.timestamp || 0) - Number(a.timestamp || 0);
    });
  }, [alertsById, crewData.crew, latest]);

  useEffect(() => {
    localStorage.setItem('dinopad-voice-critical', String(readCriticalVoice));
  }, [readCriticalVoice]);
  const lastSpokenAlertRef = useRef('');
  useEffect(() => {
    if (!readCriticalVoice || !supportsSpeech()) return;
    const critical = alerts.find((alert) => alert.level === 'critical' && alert.id !== lastSpokenAlertRef.current);
    if (critical) {
      lastSpokenAlertRef.current = critical.id;
      speakAlert(critical);
    }
  }, [alerts, readCriticalVoice]);
  const data = useMemo(() => ({
    crew: crewData.crew || CREW,
    indicators: crewData.indicators || INDICATORS,
    scenarios: crewData.scenarios || SCENARIOS,
    latest, history, alerts, scenario, setScenario,
    activeCrewId, setActiveCrewId,
    connectionState: forceOffline ? 'offline' : connectionState,
    forceOffline, setForceOffline,
    synchronized, cacheWarning,
    lastCachedAt,
    readCriticalVoice, setReadCriticalVoice,
    acknowledgedSos, acknowledgeSos,
  }), [crewData, latest, history, alerts, scenario, setScenario, activeCrewId, setActiveCrewId, forceOffline, connectionState, synchronized, cacheWarning, lastCachedAt, readCriticalVoice, acknowledgedSos, acknowledgeSos]);

  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}
