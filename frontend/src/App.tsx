import { useState, useCallback, useEffect } from 'react';
import { ConnectForm } from './components/ConnectForm';
import { Terminal } from './components/Terminal';
import { SessionList } from './components/SessionList';
import type { AppState } from './types';
import { saveSession, loadSession, clearSession } from './utils/session';
import { useConnectionHistory } from './hooks/useConnectionHistory';
import './App.css';

type ActiveAppState = 'idle' | 'connecting' | 'connected' | 'sessions';

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
  const { history, addEntry } = useConnectionHistory();

  useEffect(() => {
    const stored = loadSession();
    if (stored) {
      setSessionToken(stored.token);
      setConnectionInfo({ host: stored.host, port: stored.port, user: stored.user, expiresAt: stored.expiresAt });
      setAppState('connected');
    }
  }, []);

  const handleConnect = useCallback(
    (token: string, expiresAt: string, host: string, port: number, user: string) => {
      saveSession({ token, expiresAt, host, port, user });
      setSessionToken(token);
      setConnectionInfo({ host, port, user, expiresAt });
      addEntry(host, port, user);
      setAppState('connected');
    },
    [addEntry],
  );

  const handleDisconnect = useCallback(() => {
    clearSession();
    setAppState('idle');
    setSessionToken(null);
    setConnectionInfo(null);
  }, []);

  const handleStateChange = useCallback((state: AppState) => {
    if (state === 'idle' || state === 'connecting' || state === 'connected') {
      setAppState(state as ActiveAppState);
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

  if (appState === 'sessions') {
    return <SessionList onBack={() => setAppState('idle')} />;
  }

  return (
    <ConnectForm
      appState={appState === 'idle' || appState === 'connecting' ? appState : 'idle'}
      onConnect={handleConnect}
      onStateChange={handleStateChange}
      history={history}
      onShowSessions={() => setAppState('sessions')}
    />
  );
}
