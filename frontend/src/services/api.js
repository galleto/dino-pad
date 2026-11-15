import { CREW } from '../data/crewData';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
export const WS_URL = (import.meta.env.VITE_WS_URL || API_URL.replace(/^http/, 'ws')).replace(/\/$/, '');

async function request(path, signal) {
  const response = await fetch(`${API_URL}${path}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`API ${response.status}: ${path}`);
  return response.json();
}

export const api = {
  health: (signal) => request('/health', signal),
  crew: (signal) => request('/api/crew', signal),
  latest: (crewId, signal) => request(`/api/vitals/latest?crewId=${encodeURIComponent(crewId)}`, signal),
  history: (crewId, indicatorId, limit = 100, signal) => request(`/api/vitals/history?crewId=${encodeURIComponent(crewId)}&indicatorId=${encodeURIComponent(indicatorId)}&limit=${limit}`, signal),
  alerts: (crewId, limit = 100, signal) => request(`/api/alerts?${crewId ? `crewId=${encodeURIComponent(crewId)}&` : ''}limit=${limit}`, signal),
};

export function normalizeCrew(payload) {
  if (payload?.crew) return payload;
  return { crew: payload || CREW };
}
