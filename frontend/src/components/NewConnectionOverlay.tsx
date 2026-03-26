import { useState, useEffect, type FormEvent } from 'react';
import { connectToHost } from '../api/connect';
import type { HistoryEntry, Profile } from '../types';
import './NewConnectionOverlay.css';

interface NewConnectionOverlayProps {
  onConnect: (token: string, expiresAt: string, host: string, port: number, user: string) => void;
  onClose: () => void;
  history?: HistoryEntry[];
  profiles?: Profile[];
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

export function NewConnectionOverlay({
  onConnect,
  onClose,
  history = [],
  profiles = [],
}: NewConnectionOverlayProps) {
  const [fields, setFields] = useState<FormFields>({ host: '', port: '22', user: '' });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isLoading]);

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
    setIsLoading(true);
    try {
      const response = await connectToHost({
        host: fields.host.trim(),
        port,
        user: fields.user.trim(),
      });
      onConnect(response.session_token, response.expires_at, fields.host.trim(), port, fields.user.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setIsLoading(false);
    }
  }

  function fillFromHistory(entry: HistoryEntry) {
    if (isLoading) return;
    setFields({ host: entry.host, port: String(entry.port), user: entry.user });
    if (error) setError(null);
  }

  function fillFromProfile(profile: Profile) {
    if (isLoading) return;
    setFields({ host: profile.host, port: String(profile.port), user: profile.user });
    if (error) setError(null);
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !isLoading) {
      onClose();
    }
  }

  return (
    <div className="nco-backdrop" onClick={handleBackdropClick} aria-modal="true" role="dialog">
      <div className="nco-card">
        <h2 className="nco-title">New Connection</h2>

        <button
          className="nco-close-btn"
          aria-label="Close overlay"
          onClick={onClose}
          disabled={isLoading}
        >
          ✕
        </button>

        <form className="nco-form" onSubmit={handleSubmit} noValidate>
          <div className="nco-field">
            <label htmlFor="nco-host">Host</label>
            <input
              id="nco-host"
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

          <div className="nco-row">
            <div className="nco-field nco-field--port">
              <label htmlFor="nco-port">Port</label>
              <input
                id="nco-port"
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
            <div className="nco-field">
              <label htmlFor="nco-user">User</label>
              <input
                id="nco-user"
                name="user"
                type="text"
                placeholder="ubuntu"
                value={fields.user}
                onChange={handleChange}
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
          </div>

          <button type="submit" className="nco-submit-btn" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="nco-spinner" aria-hidden="true" />
                Connecting…
              </>
            ) : (
              'Connect'
            )}
          </button>
        </form>

        {error && (
          <div className="nco-error" role="alert">
            {error}
          </div>
        )}

        {profiles.length > 0 && (
          <div className="nco-quick-section">
            <p className="nco-quick-label">Profiles</p>
            <div className="nco-chips">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  className="nco-chip"
                  type="button"
                  disabled={isLoading}
                  onClick={() => fillFromProfile(p)}
                  title={`${p.host}:${p.port} · ${p.user}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="nco-quick-section">
            <p className="nco-quick-label">Recent</p>
            <div className="nco-chips">
              {history.map((entry, i) => (
                <button
                  key={i}
                  className="nco-chip"
                  type="button"
                  disabled={isLoading}
                  onClick={() => fillFromHistory(entry)}
                  title={`${entry.host}:${entry.port} as ${entry.user}`}
                >
                  {entry.user}@{entry.host}
                  {entry.port !== 22 ? `:${entry.port}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
