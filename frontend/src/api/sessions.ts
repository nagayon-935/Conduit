import type { SessionInfo } from '../types';

export async function fetchSessions(): Promise<SessionInfo[]> {
  const res = await fetch('/api/sessions');
  if (!res.ok) {
    throw new Error(`Failed to fetch sessions: ${res.status}`);
  }
  return res.json();
}
