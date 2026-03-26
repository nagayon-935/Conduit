import { useState, useCallback } from 'react';
import type { HistoryEntry } from '../types';
import { readJSON, writeJSON, removeKey } from '../utils/storage';
import { STORAGE_KEYS, MAX_HISTORY_ENTRIES } from '../constants';

function loadHistory(): HistoryEntry[] {
  return readJSON<HistoryEntry[]>(STORAGE_KEYS.HISTORY, []);
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
      const updated = [entry, ...filtered].slice(0, MAX_HISTORY_ENTRIES);
      writeJSON(STORAGE_KEYS.HISTORY, updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    removeKey(STORAGE_KEYS.HISTORY);
  }, []);

  return { history, addEntry, clearHistory };
}
