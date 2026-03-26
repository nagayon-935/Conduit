import { useState, type FormEvent } from 'react';
import { connectToHost } from '../api/connect';
import type { AppState } from '../types';
import type { HistoryEntry } from '../hooks/useConnectionHistory';
import './ConnectForm.css';

interface ConnectFormProps {
  appState: AppState;
  onConnect: (sessionToken: string, expiresAt: string, host: string, port: number, user: string) => void;
  onStateChange: (state: AppState) => void;
  history?: HistoryEntry[];
  onShowSessions?: () => void;
}

interface FormFields {
  host: string;
  port: string;
  user: string;
}

function validateForm(fields: FormFields): string | null {
  if (!fields.host.trim()) return 'Host is required.';
  const portNum = parseInt(fields.port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) return 'Port must be between 1 and 65535.';
  if (!fields.user.trim()) return 'Username is required.';
  return null;
}

const FEATURES = [
  { icon: '⚡', text: 'Short-lived certs' },
  { icon: '🔄', text: 'Grace period' },
  { icon: '🖥️', text: 'Multi-tab sharing' },
  { icon: '🔐', text: 'In-memory keys' },
  { icon: '🌐', text: 'Auto-reconnect' },
];

export function ConnectForm({
  appState,
  onConnect,
  onStateChange,
  history = [],
  onShowSessions,
}: ConnectFormProps) {
  const [fields, setFields] = useState<FormFields>({ host: '', port: '22', user: '' });
  const [error, setError] = useState<string | null>(null);
  const isLoading = appState === 'connecting';

  function handleHistoryClick(entry: HistoryEntry) {
    setFields({ host: entry.host, port: String(entry.port), user: entry.user });
    if (error) setError(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const validationError = validateForm(fields);
    if (validationError) { setError(validationError); return; }
    const port = parseInt(fields.port, 10);
    onStateChange('connecting');
    try {
      const response = await connectToHost({
        host: fields.host.trim(), port, user: fields.user.trim(),
      });
      onConnect(response.session_token, response.expires_at, fields.host.trim(), port, fields.user.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      onStateChange('idle');
    }
  }

  return (
    <div className="cf-page">
      <div className="cf-container">
        {/* Hero */}
        <header className="cf-hero">
          <div className="cf-logo">⛵</div>
          <h1 className="cf-title">Conduit</h1>
          <p className="cf-subtitle">Secure Web SSH Terminal</p>
        </header>

        {/* Form card */}
        <div className="cf-card">
          <form className="cf-form" onSubmit={handleSubmit} noValidate>
            <div className="cf-field">
              <label htmlFor="host">Host</label>
              <input
                id="host" name="host" type="text"
                placeholder="192.168.1.1 or hostname.example.com"
                value={fields.host} onChange={handleChange}
                disabled={isLoading} autoComplete="off" autoFocus
              />
            </div>

            <div className="cf-row">
              <div className="cf-field cf-field--port">
                <label htmlFor="port">Port</label>
                <input
                  id="port" name="port" type="number"
                  placeholder="22" value={fields.port}
                  onChange={handleChange} disabled={isLoading}
                  min={1} max={65535}
                />
              </div>
              <div className="cf-field">
                <label htmlFor="user">User</label>
                <input
                  id="user" name="user" type="text"
                  placeholder="ubuntu" value={fields.user}
                  onChange={handleChange} disabled={isLoading}
                  autoComplete="username"
                />
              </div>
            </div>

            <button type="submit" className="cf-btn" disabled={isLoading}>
              {isLoading
                ? <><span className="cf-spinner" aria-hidden="true" />Connecting…</>
                : 'Connect'}
            </button>
          </form>

          {error && <div className="cf-error" role="alert">{error}</div>}

          {history.length > 0 && (
            <div className="cf-history">
              <p className="cf-history-label">Recent</p>
              <ul className="cf-history-list">
                {history.map((entry, i) => (
                  <li
                    key={i} className="cf-history-item"
                    role="button" tabIndex={0}
                    onClick={() => handleHistoryClick(entry)}
                    onKeyDown={(e) => e.key === 'Enter' && handleHistoryClick(entry)}
                  >
                    <span className="cf-history-host">{entry.host}:{entry.port}</span>
                    <span className="cf-history-user">as {entry.user}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Feature chips */}
        <ul className="cf-features">
          {FEATURES.map((f) => (
            <li key={f.text} className="cf-feature">
              <span>{f.icon}</span> {f.text}
            </li>
          ))}
        </ul>

        {/* Footer */}
        {onShowSessions && (
          <button className="cf-sessions-btn" onClick={onShowSessions}>
            View active sessions →
          </button>
        )}
      </div>
    </div>
  );
}
