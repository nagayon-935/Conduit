import type { AuthType, ConnectRequest, Profile } from '../types';

/** Shared form field shape used by ConnectForm and NewConnectionOverlay. */
export interface FormFields {
  host: string;
  port: string;
  user: string;
  authType: AuthType;
  password: string;
  privateKey: string;
}

/** Returns default (empty) form fields. */
export function defaultFields(): FormFields {
  return { host: '', port: '22', user: '', authType: 'vault', password: '', privateKey: '' };
}

/** Validate form fields; returns an error message or null if valid. */
export function validateForm(fields: FormFields): string | null {
  if (!fields.host.trim()) return 'Host is required.';
  const portNum = parseInt(fields.port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) return 'Port must be between 1 and 65535.';
  if (!fields.user.trim()) return 'Username is required.';
  if (fields.authType === 'password' && !fields.password.trim()) return 'Password is required.';
  if (fields.authType === 'pubkey' && !fields.privateKey.trim()) return 'Private key is required.';
  return null;
}

/** Build a ConnectRequest from form fields. */
export function buildConnectRequest(entry: FormFields): ConnectRequest {
  const port = parseInt(entry.port, 10);
  const base = { host: entry.host.trim(), port, user: entry.user.trim(), auth_type: entry.authType } as const;
  if (entry.authType === 'password') {
    return { ...base, password: entry.password };
  }
  if (entry.authType === 'pubkey') {
    return { ...base, private_key: entry.privateKey };
  }
  return base;
}

/**
 * Match a profile by host+port+user, falling back to host+port with empty user.
 * Used by TabBar, ConnectForm history, and NewConnectionOverlay history.
 */
export function matchProfile(profiles: Profile[], host: string, port: number, user: string): Profile | undefined {
  return (
    profiles.find(p => p.host === host && p.port === port && p.user === user) ??
    profiles.find(p => p.host === host && p.port === port && p.user === '')
  );
}
