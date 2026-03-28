import { useState, useCallback } from 'react';
import type { HistoryEntry, AuthType } from '../types';
import { readJSON, writeJSON, removeKey } from '../utils/storage';
import { STORAGE_KEYS, MAX_HISTORY_ENTRIES } from '../constants';

// 認証方式の優先度 (高いほど優先して保存)
const AUTH_PRIORITY: Record<AuthType, number> = { vault: 2, pubkey: 1, password: 0 };

function loadHistory(): HistoryEntry[] {
  const raw = readJSON<HistoryEntry[]>(STORAGE_KEYS.HISTORY, []);
  // Default authType to 'vault' for old entries that lack it
  return raw.map((e) => ({ ...e, authType: e.authType ?? 'vault' }));
}

export function useConnectionHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const addEntry = useCallback((host: string, port: number, user: string, authType: AuthType) => {
    setHistory((prev) => {
      const existing = prev.find(
        (h) => h.host === host && h.port === port && h.user === user,
      );
      // 既存エントリが高優先度の認証方式で成功済みならその authType を維持する
      const effectiveAuthType =
        existing && AUTH_PRIORITY[existing.authType] > AUTH_PRIORITY[authType]
          ? existing.authType
          : authType;
      const entry: HistoryEntry = {
        host,
        port,
        user,
        authType: effectiveAuthType,
        connectedAt: new Date().toISOString(),
      };
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
