import { useState, useCallback, useEffect } from 'react';
import { ConnectForm } from './components/ConnectForm';
import { Terminal } from './components/Terminal';
import type { AppState } from './types';
import { saveSession, loadSession, clearSession } from './utils/session';
import './App.css';

type ActiveAppState = 'idle' | 'connecting' | 'connected';

interface ConnectionInfo {
  host: string;
  port: number;
  user: string;
  expiresAt: string;
}

export default function App() {
  const [appState, setAppState] = useState<ActiveAppState>('idle');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);

  // 起動時に localStorage に有効なセッションが残っていれば自動復元
  useEffect(() => {
    const stored = loadSession();
    if (stored) {
      setSessionToken(stored.token);
      setConnectionInfo({
        host: stored.host,
        port: stored.port,
        user: stored.user,
        expiresAt: stored.expiresAt,
      });
      setAppState('connected');
    }
  }, []);

  const handleConnect = useCallback(
    (token: string, expiresAt: string, host: string, port: number, user: string) => {
      saveSession({ token, expiresAt, host, port, user });
      setSessionToken(token);
      setConnectionInfo({ host, port, user, expiresAt });
      setAppState('connected');
    },
    [],
  );

  const handleDisconnect = useCallback(() => {
    clearSession();
    setAppState('idle');
    setSessionToken(null);
    setConnectionInfo(null);
  }, []);

  const handleStateChange = useCallback((state: AppState) => {
    if (state === 'idle' || state === 'connecting' || state === 'connected') {
      setAppState(state);
    }
  }, []);

  if (appState === 'connected' && sessionToken && connectionInfo) {
    return (
      <Terminal
        sessionToken={sessionToken}
        host={connectionInfo.host}
        port={connectionInfo.port}
        user={connectionInfo.user}
        expiresAt={connectionInfo.expiresAt}
        onDisconnect={handleDisconnect}
      />
    );
  }

  return (
    <ConnectForm
      appState={appState}
      onConnect={handleConnect}
      onStateChange={handleStateChange}
    />
  );
}
