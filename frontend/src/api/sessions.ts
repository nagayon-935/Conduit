import type { SessionInfo } from '../types';
import { apiFetch } from './fetch';

export function fetchSessions(): Promise<SessionInfo[]> {
  return apiFetch<SessionInfo[]>('/api/sessions');
}

export function killSession(token: string): Promise<void> {
  return apiFetch<void>(`/api/sessions/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
}
