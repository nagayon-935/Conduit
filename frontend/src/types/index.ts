export type AuthType = 'vault' | 'password' | 'pubkey';

export interface ConnectRequest {
  host: string;
  port: number;
  user: string;
  auth_type: AuthType;
  password?: string;
  private_key?: string;
  private_key_path?: string;
  // ProxyJump (omit or set jump_host='' to disable)
  jump_host?: string;
  jump_port?: number;
  jump_user?: string;
  jump_auth_type?: AuthType;
  jump_password?: string;
  jump_private_key?: string;
  jump_private_key_path?: string;
}

export interface ConnectResponse {
  session_token: string;
  expires_at: string;
  message: string;
}

export interface ApiError {
  error: string;
  code: string;
}

// WebSocket control message envelope
export type WsControlMessage =
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'error'; message: string }
  | { type: 'exit' };

export type AppState = 'idle' | 'connecting';

/** Terminal pane layout: single / side-by-side / top-bottom / 2×2 grid */
export type LayoutType = '1' | '2v' | '2h' | '4';

// ── Frontend-only domain types ───────────────────────────────────────────

export interface Profile {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  authType: AuthType;
  createdAt: string;
  /** ssh_config の IdentityFile パス（ヒント表示用） */
  identityFilePath?: string;
  jumpHost?: string;
  jumpPort?: number;
  jumpUser?: string;
  jumpAuthType?: AuthType;
  /** ssh_config の ProxyJump 先 IdentityFile パス（ヒント表示用） */
  jumpIdentityFilePath?: string;
}

export interface HistoryEntry {
  host: string;
  port: number;
  user: string;
  authType: AuthType;
  connectedAt: string;
}

export interface StoredSession {
  token: string;
  expiresAt: string;
  host: string;
  port: number;
  user: string;
}

export interface SessionInfo {
  token: string;
  host: string;
  port: number;
  user: string;
  state: 'connected' | 'disconnected' | 'terminated';
  created_at: string;
  expires_at: string;
  ws_count: number;
}
