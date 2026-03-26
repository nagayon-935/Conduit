import { useState, useEffect } from 'react';
import { fetchSessions } from '../api/sessions';
import type { SessionInfo } from '../types';
import './SessionList.css';

interface SessionListProps {
  onBack: () => void;
}

export function SessionList({ onBack }: SessionListProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchSessions();
        if (!cancelled) {
          setSessions(data);
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
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function formatExpiry(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString();
  }

  return (
    <div className="session-list-wrapper">
      <div className="session-list-card">
        <div className="session-list-header">
          <button className="back-btn" onClick={onBack}>
            ← Back
          </button>
          <h2 className="session-list-title">Active Sessions</h2>
        </div>

        {error && (
          <div className="session-list-error" role="alert">
            {error}
          </div>
        )}

        {sessions.length === 0 && !error ? (
          <p className="session-list-empty">No active sessions.</p>
        ) : (
          <div className="session-table-wrapper">
            <table className="session-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Host</th>
                  <th>User</th>
                  <th>State</th>
                  <th>Active Tabs</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={i}>
                    <td className="mono">{s.token}</td>
                    <td className="mono">{s.host}:{s.port}</td>
                    <td>{s.user}</td>
                    <td>
                      <span className={`state-badge state-badge--${s.state}`}>
                        {s.state}
                      </span>
                    </td>
                    <td className="center">{s.ws_count}</td>
                    <td>{formatExpiry(s.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
