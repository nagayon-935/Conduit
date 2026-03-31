import type { AuthType, ConnectRequest, LocalForward, Profile } from '../types';

/** Shared form field shape used by ConnectForm and NewConnectionOverlay. */
export interface FormFields {
  host: string;
  port: string;
  user: string;
  authType: AuthType;
  password: string;
  /** PEM content of the selected private key file — sent to backend, never displayed */
  privateKey: string;
  /** Display-only filename of the selected key file */
  privateKeyName: string;
  // ProxyJump (empty jumpHost means no jump)
  jumpHost: string;
  jumpPort: string;
  jumpUser: string;
  jumpAuthType: AuthType;
  jumpPassword: string;
  jumpPrivateKey: string;
  jumpPrivateKeyName: string;
}

/** Returns default (empty) form fields. */
export function defaultFields(): FormFields {
  return {
    host: '', port: '22', user: '', authType: 'vault', password: '', privateKey: '', privateKeyName: '',
    jumpHost: '', jumpPort: '22', jumpUser: '', jumpAuthType: 'vault', jumpPassword: '', jumpPrivateKey: '', jumpPrivateKeyName: '',
  };
}

/** Validate form fields; returns an error message or null if valid. */
export function validateForm(fields: FormFields): string | null {
  if (!fields.host.trim()) return 'Host is required.';
  const portNum = parseInt(fields.port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) return 'Port must be between 1 and 65535.';
  if (!fields.user.trim()) return 'Username is required.';
  if (fields.authType === 'password' && !fields.password.trim()) return 'Password is required.';
  if (fields.authType === 'pubkey' && !fields.privateKey.trim()) return 'Private key is required.';
  // ProxyJump validation (only when jump host is specified)
  if (fields.jumpHost.trim()) {
    if (!fields.jumpUser.trim()) return 'Jump host: Username is required.';
    const jumpPort = parseInt(fields.jumpPort, 10);
    if (isNaN(jumpPort) || jumpPort < 1 || jumpPort > 65535) return 'Jump host: Port must be between 1 and 65535.';
    if (fields.jumpAuthType === 'password' && !fields.jumpPassword.trim()) return 'Jump host: Password is required.';
    if (fields.jumpAuthType === 'pubkey' && !fields.jumpPrivateKey.trim()) return 'Jump host: Private key is required.';
  }
  return null;
}

/** Build a ConnectRequest from form fields. */
export function buildConnectRequest(entry: FormFields, localForwards?: LocalForward[]): ConnectRequest {
  const port = parseInt(entry.port, 10);
  const req: ConnectRequest = { host: entry.host.trim(), port, user: entry.user.trim(), auth_type: entry.authType };
  if (entry.authType === 'password') req.password = entry.password;
  if (entry.authType === 'pubkey') req.private_key = entry.privateKey;

  if (entry.jumpHost.trim()) {
    req.jump_host = entry.jumpHost.trim();
    req.jump_port = parseInt(entry.jumpPort, 10) || 22;
    req.jump_user = entry.jumpUser.trim();
    req.jump_auth_type = entry.jumpAuthType;
    if (entry.jumpAuthType === 'password') req.jump_password = entry.jumpPassword;
    if (entry.jumpAuthType === 'pubkey') req.jump_private_key = entry.jumpPrivateKey;
  }

  if (localForwards && localForwards.length > 0) {
    req.local_forwards = localForwards.map((lf) => ({
      local_port: lf.localPort,
      remote_host: lf.remoteHost,
      remote_port: lf.remotePort,
    }));
  }

  return req;
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
