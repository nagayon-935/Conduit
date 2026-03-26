import type { SessionInfo } from '../types';

export async function fetchSessions(): Promise<SessionInfo[]> {
  const res = await fetch('/api/sessions');
  if (!res.ok) {
    throw new Error(`Failed to fetch sessions: ${res.status}`);
  }
  return res.json();
}

export async function killSession(token: string): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to kill session: ${res.status}`);
  }
}
