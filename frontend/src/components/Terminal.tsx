import { useEffect, useCallback } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import { useWebSocket } from '../hooks/useWebSocket';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

interface TerminalProps {
  sessionToken: string;
  host: string;
  port: number;
  user: string;
  expiresAt: string;
  onDisconnect: () => void;
}

function formatReconnectDeadline(expiresAt: string): string {
  try {
    const date = new Date(expiresAt);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return expiresAt;
  }
}

export function Terminal({ sessionToken, host, port, user, expiresAt, onDisconnect }: TerminalProps) {
  const { terminalRef, terminal, fitAddon, initTerminal, disposeTerminal } = useTerminal();

  const handleError = useCallback((msg: string) => {
    console.error('[Conduit] WebSocket error:', msg);
  }, []);

  const { connect, disconnect, isConnected } = useWebSocket({
    token: sessionToken,
    terminal,
    fitAddon,
    onDisconnect,
    onError: handleError,
  });

  // Init terminal on mount, then connect WebSocket once terminal is ready
  useEffect(() => {
    initTerminal();
    return () => {
      disposeTerminal();
    };
  }, [initTerminal, disposeTerminal]);

  // Connect WebSocket once the terminal instance is available
  useEffect(() => {
    if (terminal) {
      connect();
    }
    // We only want to (re-)connect when the terminal instance changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal]);

  function handleDisconnect() {
    disconnect();
    onDisconnect();
  }

  return (
    <div className="terminal-wrapper">
      <div className="terminal-status-bar">
        <div className="status-left">
          <div className="status-indicator">
            <span className="status-dot" aria-hidden="true">●</span>
            <span className="status-label">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>

          <div className="status-divider" />

          <div className="status-info">
            <span className="status-host">{host}:{port}</span>
            <span className="status-sep">•</span>
            <span className="status-user">{user}</span>
            <span className="status-sep">•</span>
            <span className="status-expires">
              {isConnected
                ? 'Grace: 15m'
                : `Reconnect by: ${formatReconnectDeadline(expiresAt)}`}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="disconnect-btn"
          onClick={handleDisconnect}
          title="Disconnect from SSH session"
        >
          Disconnect
        </button>
      </div>

      <div className="terminal-container" ref={terminalRef} />
    </div>
  );
}
