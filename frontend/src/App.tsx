import { useState, useCallback } from 'react';
import { ConnectForm } from './components/ConnectForm';
import { Terminal } from './components/Terminal';
import type { AppState } from './types';
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

  const handleConnect = useCallback(
    (token: string, expiresAt: string, host: string, port: number, user: string) => {
      setSessionToken(token);
      setConnectionInfo({ host, port, user, expiresAt });
      setAppState('connected');
    },
    [],
  );

  const handleDisconnect = useCallback(() => {
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
