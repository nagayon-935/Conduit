const STORAGE_KEY = 'conduit_session';

export interface StoredSession {
  token: string;
  expiresAt: string;
  host: string;
  port: number;
  user: string;
}

/** セッション情報を localStorage に保存する */
export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage が使えない環境では無視
  }
}

/**
 * localStorage からセッション情報を読み込む。
 * 存在しない・期限切れ・パース失敗の場合は null を返す。
 */
export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as StoredSession;

    // 期限切れチェック
    if (new Date(session.expiresAt) <= new Date()) {
      clearSession();
      return null;
    }

    return session;
  } catch {
    clearSession();
    return null;
  }
}

/** localStorage のセッション情報を削除する */
export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
