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

interface UseProfilesReturn {
  profiles: Profile[];
  saveProfile: (name: string, host: string, port: number, user: string, authType: AuthType, jump?: JumpParams) => void;
  deleteProfile: (id: string) => void;
  loadProfile: (id: string) => Profile | undefined;
  importProfiles: (entries: {
    name: string; host: string; port: number; user: string;
    authType?: AuthType; identityFile?: string;
    jumpHost?: string; jumpPort?: number; jumpUser?: string; jumpIdentityFile?: string;
  }[]) => number;
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

  // 既存プロフィールと name+host が重複しないものだけを追加し、追加件数を返す
  const importProfiles = useCallback(
    (entries: {
      name: string; host: string; port: number; user: string;
      authType?: AuthType; identityFile?: string;
      jumpHost?: string; jumpPort?: number; jumpUser?: string; jumpIdentityFile?: string;
    }[]): number => {
      let added = 0;
      setProfiles((prev) => {
        const existingKeys = new Set(prev.map((p) => `${p.name}|${p.host}`));
        const newProfiles: Profile[] = entries
          .filter((e) => !existingKeys.has(`${e.name}|${e.host}`))
          .map((e) => ({
            id: generateId(),
            name: e.name,
            host: e.host,
            port: e.port,
            user: e.user,
            // IdentityFile があれば pubkey 認証、なければ vault をデフォルトに
            authType: e.authType ?? (e.identityFile ? 'pubkey' : 'vault'),
            createdAt: new Date().toISOString(),
            ...(e.identityFile ? { identityFilePath: e.identityFile } : {}),
            ...(e.jumpHost ? {
              jumpHost: e.jumpHost,
              jumpPort: e.jumpPort,
              jumpUser: e.jumpUser,
              ...(e.jumpIdentityFile ? { jumpIdentityFilePath: e.jumpIdentityFile } : {}),
            } : {}),
          }));
        added = newProfiles.length;
        const updated = [...newProfiles, ...prev].slice(0, MAX_PROFILES);
        saveToStorage(updated);
        return updated;
      });
      return added;
    },
    [],
  );

  return { profiles, saveProfile, deleteProfile, loadProfile, importProfiles };
}
