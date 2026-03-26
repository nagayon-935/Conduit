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
  onSelectHistory?: (entry: HistoryEntry) => void;
}

interface FormFields {
  host: string;
  port: string;
  user: string;
}

function validateForm(fields: FormFields): string | null {
  if (!fields.host.trim()) {
    return 'Host is required.';
  }
  const portNum = parseInt(fields.port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return 'Port must be between 1 and 65535.';
  }
  if (!fields.user.trim()) {
    return 'Username is required.';
  }
  return null;
}

export function ConnectForm({ appState, onConnect, onStateChange, history = [], onSelectHistory }: ConnectFormProps) {
  const [fields, setFields] = useState<FormFields>({ host: '', port: '22', user: '' });
  const [error, setError] = useState<string | null>(null);

  const isLoading = appState === 'connecting';

  function handleHistoryClick(entry: HistoryEntry) {
    setFields({ host: entry.host, port: String(entry.port), user: entry.user });
    if (error) setError(null);
    onSelectHistory?.(entry);
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
    if (validationError) {
      setError(validationError);
      return;
    }

    const port = parseInt(fields.port, 10);
    onStateChange('connecting');

    try {
      const response = await connectToHost({
        host: fields.host.trim(),
        port,
        user: fields.user.trim(),
      });
      onConnect(
        response.session_token,
        response.expires_at,
        fields.host.trim(),
        port,
        fields.user.trim(),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
      onStateChange('idle');
    }
  }

  return (
    <div className="connect-form-wrapper">
      <div className="connect-card">
        <div className="connect-header">
          <h1 className="connect-title">
            <span className="connect-title-icon">🔌</span>
            Conduit
          </h1>
          <p className="connect-subtitle">Web SSH Terminal</p>
        </div>

        <form className="connect-form" onSubmit={handleSubmit} noValidate>
          <div className="field-group">
            <label htmlFor="host">Host</label>
            <input
              id="host"
              name="host"
              type="text"
              placeholder="192.168.1.1 or hostname.example.com"
              value={fields.host}
              onChange={handleChange}
              disabled={isLoading}
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="field-row">
            <div className="field-group field-group--port">
              <label htmlFor="port">Port</label>
              <input
                id="port"
                name="port"
                type="number"
                placeholder="22"
                value={fields.port}
                onChange={handleChange}
                disabled={isLoading}
                min={1}
                max={65535}
              />
            </div>

            <div className="field-group">
              <label htmlFor="user">User</label>
              <input
                id="user"
                name="user"
                type="text"
                placeholder="root"
                value={fields.user}
                onChange={handleChange}
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
          </div>

          <button type="submit" className="connect-btn" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Connecting…
              </>
            ) : (
              'Connect'
            )}
          </button>
        </form>

        {error && (
          <div className="connect-error" role="alert">
            {error}
          </div>
        )}

        {history.length > 0 && (
          <div className="history-section">
            <p className="history-label">Recent Connections</p>
            <ul className="history-list">
              {history.map((entry, i) => (
                <li
                  key={i}
                  className="history-item"
                  onClick={() => handleHistoryClick(entry)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleHistoryClick(entry)}
                >
                  <span className="history-target">
                    {entry.host}:{entry.port}
                  </span>
                  <span className="history-user">as {entry.user}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
