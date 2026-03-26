export interface ConnectRequest {
  host: string;
  port: number;
  user: string;
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

export type AppState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

/** Terminal pane layout: single / side-by-side / top-bottom / 2×2 grid */
export type LayoutType = '1' | '2v' | '2h' | '4';

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
