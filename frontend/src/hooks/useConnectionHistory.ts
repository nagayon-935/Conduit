import { useState, useCallback } from 'react';

export interface HistoryEntry {
  host: string;
  port: number;
  user: string;
  connectedAt: string;
}

const STORAGE_KEY = 'conduit-history';
const MAX_ENTRIES = 10;

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function useConnectionHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const addEntry = useCallback((host: string, port: number, user: string) => {
    const entry: HistoryEntry = {
      host,
      port,
      user,
      connectedAt: new Date().toISOString(),
    };
    setHistory((prev) => {
      const filtered = prev.filter(
        (h) => !(h.host === host && h.port === port && h.user === user),
      );
      const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { history, addEntry, clearHistory };
}
