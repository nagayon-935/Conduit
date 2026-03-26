import { useState, useEffect } from 'react';
import { fetchSessions } from '../api/sessions';
import type { SessionInfo } from '../types';
import './SessionList.css';

interface SessionListProps {
  onBack: () => void;
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs <= 0) return 'expired';
  const diffMin = Math.floor(diffMs / 60000);
  const diffSec = Math.floor((diffMs % 60000) / 1000);
  if (diffMin > 0) return `${diffMin}m ${diffSec}s`;
  return `${diffSec}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function SessionList({ onBack }: SessionListProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchSessions();
        if (!cancelled) {
          setSessions(data);
          setLastUpdated(new Date());
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load sessions');
        }
      }
    }

    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const connected = sessions.filter((s) => s.state === 'connected').length;
  const disconnected = sessions.filter((s) => s.state === 'disconnected').length;

  return (
    <div className="sl-page">
      {/* Nav */}
      <header className="sl-nav">
        <button className="sl-back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="sl-nav-center">
          <span className="sl-nav-title">Active Sessions</span>
          {lastUpdated && (
            <span className="sl-updated">Updated {formatTime(lastUpdated.toISOString())}</span>
          )}
        </div>
        <div className="sl-nav-right" />
      </header>

      <main className="sl-main">
        {/* Stats row */}
        <div className="sl-stats">
          <div className="sl-stat">
            <span className="sl-stat-value">{sessions.length}</span>
            <span className="sl-stat-label">Total</span>
          </div>
          <div className="sl-stat sl-stat--connected">
            <span className="sl-stat-value">{connected}</span>
            <span className="sl-stat-label">Connected</span>
          </div>
          <div className="sl-stat sl-stat--disconnected">
            <span className="sl-stat-value">{disconnected}</span>
            <span className="sl-stat-label">Grace Period</span>
          </div>
        </div>

        {error && (
          <div className="sl-error" role="alert">{error}</div>
        )}

        {sessions.length === 0 && !error ? (
          <div className="sl-empty">
            <div className="sl-empty-icon">🖥️</div>
            <p className="sl-empty-text">No active sessions</p>
            <p className="sl-empty-sub">Connect to an SSH server to get started.</p>
          </div>
        ) : (
          <div className="sl-table-wrapper">
            <table className="sl-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Host</th>
                  <th>User</th>
                  <th>State</th>
                  <th>Tabs</th>
                  <th>Created</th>
                  <th>Expires in</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={i}>
                    <td><code className="token-cell">{s.token}</code></td>
                    <td><code>{s.host}:{s.port}</code></td>
                    <td>{s.user}</td>
                    <td>
                      <span className={`state-badge state-badge--${s.state}`}>
                        {s.state === 'connected' ? '● Connected' : s.state === 'disconnected' ? '○ Grace' : '✕ Ended'}
                      </span>
                    </td>
                    <td className="center">{s.ws_count}</td>
                    <td className="muted">{formatTime(s.created_at)}</td>
                    <td className={`expiry ${s.state === 'disconnected' ? 'expiry--warn' : ''}`}>
                      {formatExpiry(s.expires_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
