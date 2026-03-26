import { useState, useCallback } from 'react';

export interface Profile {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  createdAt: string;
}

const STORAGE_KEY = 'conduit-profiles';
const MAX_PROFILES = 20;

function loadFromStorage(): Profile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Profile[];
  } catch {
    return [];
  }
}

function saveToStorage(profiles: Profile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface UseProfilesReturn {
  profiles: Profile[];
  saveProfile: (name: string, host: string, port: number, user: string) => void;
  deleteProfile: (id: string) => void;
  loadProfile: (id: string) => Profile | undefined;
}

export function useProfiles(): UseProfilesReturn {
  const [profiles, setProfiles] = useState<Profile[]>(() => loadFromStorage());

  const saveProfile = useCallback((name: string, host: string, port: number, user: string) => {
    const newProfile: Profile = {
      id: generateId(),
      name,
      host,
      port,
      user,
      createdAt: new Date().toISOString(),
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
    (id: string): Profile | undefined => {
      return profiles.find((p) => p.id === id);
    },
    [profiles],
  );

  return { profiles, saveProfile, deleteProfile, loadProfile };
}
