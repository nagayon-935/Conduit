import { useState, useCallback } from 'react';
import type { Profile, AuthType } from '../types';
import { readJSON, writeJSON } from '../utils/storage';
import { STORAGE_KEYS, MAX_PROFILES } from '../constants';

function loadFromStorage(): Profile[] {
  const raw = readJSON<Profile[]>(STORAGE_KEYS.PROFILES, []);
  // Default authType to 'vault' for old entries that lack it
  return raw.map((p) => ({ ...p, authType: p.authType ?? 'vault' }));
}

function saveToStorage(profiles: Profile[]): void {
  writeJSON(STORAGE_KEYS.PROFILES, profiles);
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface JumpParams {
  jumpHost?: string;
  jumpPort?: number;
  jumpUser?: string;
  jumpAuthType?: AuthType;
}

interface ImportEntry {
  name: string; host: string; port: number; user: string;
  authType?: AuthType; identityFile?: string;
  jumpHost?: string; jumpPort?: number; jumpUser?: string; jumpIdentityFile?: string;
}

interface UseProfilesReturn {
  profiles: Profile[];
  saveProfile: (name: string, host: string, port: number, user: string, authType: AuthType, jump?: JumpParams) => void;
  deleteProfile: (id: string) => void;
  loadProfile: (id: string) => Profile | undefined;
  importProfiles: (entries: ImportEntry[], upsert?: boolean) => { added: number; updated: number };
}

export function useProfiles(): UseProfilesReturn {
  const [profiles, setProfiles] = useState<Profile[]>(loadFromStorage);

  const saveProfile = useCallback((name: string, host: string, port: number, user: string, authType: AuthType, jump?: JumpParams) => {
    const newProfile: Profile = {
      id: generateId(),
      name,
      host,
      port,
      user,
      authType,
      createdAt: new Date().toISOString(),
      ...(jump?.jumpHost ? {
        jumpHost: jump.jumpHost,
        jumpPort: jump.jumpPort,
        jumpUser: jump.jumpUser,
        jumpAuthType: jump.jumpAuthType,
      } : {}),
    };
    setProfiles((prev) => {
      const updated = [newProfile, ...prev].slice(0, MAX_PROFILES);
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const deleteProfile = useCallback((id: string) => {
    setProfiles((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const loadProfile = useCallback(
    (id: string): Profile | undefined => profiles.find((p) => p.id === id),
    [profiles],
  );

  // ssh_config エントリを Profile に変換するヘルパー
  function toProfile(e: ImportEntry, existingId?: string): Profile {
    return {
      id: existingId ?? generateId(),
      name: e.name,
      host: e.host,
      port: e.port,
      user: e.user,
      authType: e.authType ?? (e.identityFile ? 'pubkey' : 'vault'),
      createdAt: new Date().toISOString(),
      ...(e.identityFile ? { identityFilePath: e.identityFile } : {}),
      ...(e.jumpHost ? {
        jumpHost: e.jumpHost,
        jumpPort: e.jumpPort,
        jumpUser: e.jumpUser,
        ...(e.jumpIdentityFile ? { jumpIdentityFilePath: e.jumpIdentityFile } : {}),
      } : {}),
    };
  }

  // upsert=false: 重複をスキップして追加のみ
  // upsert=true : 既存プロファイルを上書き更新し、新規は追加
  const importProfiles = useCallback(
    (entries: ImportEntry[], upsert = false): { added: number; updated: number } => {
      let added = 0;
      let updated = 0;
      setProfiles((prev) => {
        const existingMap = new Map(prev.map((p) => [`${p.name}|${p.host}`, p]));
        const next = upsert
          ? prev.map((p) => {
              const incoming = entries.find((e) => `${e.name}|${e.host}` === `${p.name}|${p.host}`);
              if (!incoming) return p;
              updated++;
              return toProfile(incoming, p.id);
            })
          : [...prev];
        entries
          .filter((e) => !existingMap.has(`${e.name}|${e.host}`))
          .forEach((e) => {
            next.unshift(toProfile(e));
            added++;
          });
        const result = next.slice(0, MAX_PROFILES);
        saveToStorage(result);
        return result;
      });
      return { added, updated };
    },
    [],
  );

  return { profiles, saveProfile, deleteProfile, loadProfile, importProfiles };
}
