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

interface KeyParams {
  privateKeyContent?: string;
  privateKeyName?: string;
  jumpPrivateKeyContent?: string;
  jumpPrivateKeyName?: string;
}

interface ImportEntry {
  name: string; host: string; port: number; user: string;
  authType?: AuthType;
  jumpHost?: string; jumpPort?: number; jumpUser?: string;
}

interface UseProfilesReturn {
  profiles: Profile[];
  saveProfile: (name: string, host: string, port: number, user: string, authType: AuthType, jump?: JumpParams, keys?: KeyParams) => void;
  deleteProfile: (id: string) => void;
  loadProfile: (id: string) => Profile | undefined;
  storeProfileKeys: (id: string, keys: KeyParams) => void;
  importProfiles: (entries: ImportEntry[], upsert?: boolean) => { added: number; updated: number };
}

export function useProfiles(): UseProfilesReturn {
  const [profiles, setProfiles] = useState<Profile[]>(loadFromStorage);

  const saveProfile = useCallback((name: string, host: string, port: number, user: string, authType: AuthType, jump?: JumpParams, keys?: KeyParams) => {
    const newProfile: Profile = {
      id: generateId(),
      name,
      host,
      port,
      user,
      authType,
      createdAt: new Date().toISOString(),
      ...(keys?.privateKeyContent ? { privateKeyContent: keys.privateKeyContent, privateKeyName: keys.privateKeyName } : {}),
      ...(jump?.jumpHost ? {
        jumpHost: jump.jumpHost,
        jumpPort: jump.jumpPort,
        jumpUser: jump.jumpUser,
        jumpAuthType: jump.jumpAuthType,
        ...(keys?.jumpPrivateKeyContent ? { jumpPrivateKeyContent: keys.jumpPrivateKeyContent, jumpPrivateKeyName: keys.jumpPrivateKeyName } : {}),
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

  // 鍵ファイル選択時にプロファイルへ内容を保存する
  const storeProfileKeys = useCallback((id: string, keys: KeyParams) => {
    setProfiles((prev) => {
      const updated = prev.map((p) =>
        p.id !== id ? p : {
          ...p,
          ...(keys.privateKeyContent !== undefined ? { privateKeyContent: keys.privateKeyContent, privateKeyName: keys.privateKeyName } : {}),
          ...(keys.jumpPrivateKeyContent !== undefined ? { jumpPrivateKeyContent: keys.jumpPrivateKeyContent, jumpPrivateKeyName: keys.jumpPrivateKeyName } : {}),
        }
      );
      saveToStorage(updated);
      return updated;
    });
  }, []);

  // upsert=false: 重複をスキップして追加のみ
  // upsert=true : 既存プロファイルを上書き更新し、新規は追加（鍵内容は保持）
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
              // 接続情報を更新しつつ保存済みの鍵内容は引き継ぐ
              return {
                ...p,
                host: incoming.host,
                port: incoming.port,
                user: incoming.user,
                authType: incoming.authType ?? (p.authType !== 'vault' ? p.authType : 'vault'),
                ...(incoming.jumpHost ? { jumpHost: incoming.jumpHost, jumpPort: incoming.jumpPort, jumpUser: incoming.jumpUser } : {}),
              };
            })
          : [...prev];
        entries
          .filter((e) => !existingMap.has(`${e.name}|${e.host}`))
          .forEach((e) => {
            next.unshift({
              id: generateId(),
              name: e.name,
              host: e.host,
              port: e.port,
              user: e.user,
              authType: e.authType ?? 'vault',
              createdAt: new Date().toISOString(),
              ...(e.jumpHost ? { jumpHost: e.jumpHost, jumpPort: e.jumpPort, jumpUser: e.jumpUser } : {}),
            });
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

  return { profiles, saveProfile, deleteProfile, loadProfile, storeProfileKeys, importProfiles };
}
