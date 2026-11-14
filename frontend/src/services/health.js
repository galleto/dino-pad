// ============================================================
// health.js · Lógica de interpretación (estado, tendencia, alertas)
// No depende de React ni del simulador: sirve igual con sensores reales.
// ============================================================
import { INDICATORS } from '../data/crewData';

// Rango de un indicador para un tripulante (usa el propio si existe)
export function getRanges(indicator, crew) {
  const own = crew?.ranges?.[indicator.id] || {};
  return { ok: own.ok || indicator.ok, warn: own.warn || indicator.warn };
}

// Devuelve 'ok' | 'warn' | 'crit' | 'nodata'
export function getStatus(indicator, crew, reading) {
  if (!reading || reading.quality === 'no_signal') return 'nodata';
  const { ok, warn } = getRanges(indicator, crew);
  const v = reading.value;
  if (v >= ok[0] && v <= ok[1]) return 'ok';
  if (v >= warn[0] && v <= warn[1]) return 'warn';
  return 'crit';
}

// Tendencia: compara la última lectura válida con el promedio de las anteriores
export function getTrend(history = []) {
  const valid = history.filter((r) => r.quality !== 'no_signal');
  if (valid.length < 4) return 'flat';
  const last = valid[valid.length - 1].value;
  const prev = valid.slice(-6, -1);
  const avg = prev.reduce((s, r) => s + r.value, 0) / prev.length;
  const delta = last - avg;
  const threshold = Math.abs(avg) * 0.02;
  if (delta > threshold) return 'up';
  if (delta < -threshold) return 'down';
  return 'flat';
}

export const STATUS_LABEL = {
  ok: 'Normal',
  warn: 'Atención',
  crit: 'Crítico',
  nodata: 'Sin señal',
};

// Genera alertas contextuales a partir de las últimas lecturas de un tripulante
// level: 'info' | 'warning' | 'critical'
export function buildAlerts(crew, latestByIndicator) {
  const alerts = [];
  Object.values(INDICATORS).forEach((ind) => {
    const reading = latestByIndicator?.[ind.id];
    const status = getStatus(ind, crew, reading);
    if (status === 'ok') return;
    const base = {
      id: `${crew.id}-${ind.id}`,
      crewId: crew.id,
      indicatorId: ind.id,
      zone: ind.zone,
    };
    if (status === 'nodata') {
      alerts.push({
        ...base,
        level: 'info',
        title: `${ind.name}: sin señal`,
        message: 'El sensor no está enviando datos.',
        action: 'Revisa que la pulsera esté bien colocada.',
      });
      return;
    }
    const { ok } = getRanges(ind, crew);
    const dir = reading.value < ok[0] ? 'por debajo' : 'por encima';
    alerts.push({
      ...base,
      level: status === 'crit' ? 'critical' : 'warning',
      title: `${ind.name} ${status === 'crit' ? 'crítica' : 'fuera de rango'}`,
      message: `${reading.value} ${ind.unit}, ${dir} del rango normal (${ok[0]}–${ok[1]}).`,
      action: ind.action,
      timestamp: reading.timestamp,
    });
  });
  const order = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

// Estado global del tripulante (para el punto de la barra superior)
export function getOverallStatus(crew, latestByIndicator) {
  const alerts = buildAlerts(crew, latestByIndicator);
  if (alerts.some((a) => a.level === 'critical')) return 'crit';
  if (alerts.some((a) => a.level === 'warning')) return 'warn';
  return 'ok';
}