import { useState, type FormEvent } from 'react';
import { connectToHost } from '../api/connect';
import type { AppState } from '../types';
import type { HistoryEntry } from '../types';
import { useProfiles } from '../hooks/useProfiles';
import './ConnectForm.css';

interface ConnectFormProps {
  appState: AppState;
  onConnect: (sessionToken: string, expiresAt: string, host: string, port: number, user: string) => void;
  onStateChange: (state: AppState) => void;
  history?: HistoryEntry[];
  onShowSessions?: () => void;
  onShowLogs?: () => void;
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
  onShowLogs,
}: ConnectFormProps) {
  const [fields, setFields] = useState<FormFields>({ host: '', port: '22', user: '' });
  const [extraEntries, setExtraEntries] = useState<FormFields[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isLoading = appState === 'connecting';

  // Feature ④: Connection profiles
  const { profiles, saveProfile, deleteProfile } = useProfiles();
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [profileName, setProfileName] = useState('');

  function handleHistoryClick(entry: HistoryEntry) {
    setFields({ host: entry.host, port: String(entry.port), user: entry.user });
    if (error) setError(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  }

  function handleExtraChange(index: number, field: keyof FormFields, value: string) {
    setExtraEntries((prev) => prev.map((entry, i) => i === index ? { ...entry, [field]: value } : entry));
    if (error) setError(null);
  }

  function addExtraEntry() {
    setExtraEntries((prev) => [...prev, { host: '', port: '22', user: '' }]);
  }

  function removeExtraEntry(index: number) {
    setExtraEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const allEntries = [fields, ...extraEntries].filter((entry) => entry.host.trim());

    // Validate all entries
    for (const entry of allEntries) {
      const validationError = validateForm(entry);
      if (validationError) { setError(validationError); return; }
    }

    if (allEntries.length === 0) {
      setError('Host is required.');
      return;
    }

    onStateChange('connecting');

    if (allEntries.length === 1) {
      // Single host: original behaviour
      const entry = allEntries[0];
      const port = parseInt(entry.port, 10);
      try {
        const response = await connectToHost({
          host: entry.host.trim(), port, user: entry.user.trim(),
        });
        onConnect(response.session_token, response.expires_at, entry.host.trim(), port, entry.user.trim());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        onStateChange('idle');
      }
      return;
    }

    // Multiple hosts: connect in parallel
    const results = await Promise.allSettled(
      allEntries.map((entry) =>
        connectToHost({ host: entry.host.trim(), port: parseInt(entry.port, 10), user: entry.user.trim() })
      )
    );

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const entry = allEntries[i];
        onConnect(result.value.session_token, result.value.expires_at, entry.host.trim(), parseInt(entry.port, 10), entry.user.trim());
      }
    });

    const failedIndices = results.reduce<number[]>((acc, r, i) => {
      if (r.status === 'rejected') acc.push(i);
      return acc;
    }, []);
    if (failedIndices.length > 0 && failedIndices.length === results.length) {
      setError('All connections failed.');
      onStateChange('idle');
    } else if (failedIndices.length > 0) {
      const failedHosts = failedIndices.map((i) => allEntries[i].host);
      setError(`${results.length - failedIndices.length}/${results.length} connected. Failed: ${failedHosts.join(', ')}`);
      onStateChange('idle');
    } else {
      onStateChange('idle');
    }
  }

  function handleSaveProfile() {
    const validationError = validateForm(fields);
    if (validationError) { setError(validationError); return; }
    const name = profileName.trim() || `${fields.user}@${fields.host}`;
    saveProfile(name, fields.host.trim(), parseInt(fields.port, 10), fields.user.trim());
    setProfileName('');
    setShowSaveProfile(false);
  }

  function handleLoadProfile(id: string) {
    const p = profiles.find((x) => x.id === id);
    if (p) {
      setFields({ host: p.host, port: String(p.port), user: p.user });
      if (error) setError(null);
    }
  }

  function handleExtraLoadProfile(index: number, id: string) {
    const p = profiles.find((x) => x.id === id);
    if (p) {
      setExtraEntries((prev) =>
        prev.map((entry, i) =>
          i === index ? { host: p.host, port: String(p.port), user: p.user } : entry
        )
      );
      if (error) setError(null);
    }
  }

  function handleExtraLoadHistory(index: number, h: HistoryEntry) {
    setExtraEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { host: h.host, port: String(h.port), user: h.user } : entry
      )
    );
    if (error) setError(null);
  }

  const hasMultiple = extraEntries.length > 0;

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
                : hasMultiple ? 'Connect All' : 'Connect'}
            </button>
          </form>

          {/* Extra host entries — same layout as main form */}
          {extraEntries.map((entry, i) => (
            <div key={i} className="cf-extra-card">
              <div className="cf-extra-card-header">
                <span className="cf-extra-card-label">Host {i + 2}</span>
                <button
                  type="button"
                  className="cf-extra-remove"
                  onClick={() => removeExtraEntry(i)}
                  disabled={isLoading}
                  title="Remove"
                >
                  ✕
                </button>
              </div>

              <div className="cf-field">
                <label>Host</label>
                <input
                  type="text"
                  placeholder="192.168.1.1 or hostname.example.com"
                  value={entry.host}
                  onChange={(e) => handleExtraChange(i, 'host', e.target.value)}
                  disabled={isLoading}
                  autoComplete="off"
                />
              </div>

              <div className="cf-row">
                <div className="cf-field cf-field--port">
                  <label>Port</label>
                  <input
                    type="number"
                    placeholder="22"
                    value={entry.port}
                    onChange={(e) => handleExtraChange(i, 'port', e.target.value)}
                    disabled={isLoading}
                    min={1}
                    max={65535}
                  />
                </div>
                <div className="cf-field">
                  <label>User</label>
                  <input
                    type="text"
                    placeholder="ubuntu"
                    value={entry.user}
                    onChange={(e) => handleExtraChange(i, 'user', e.target.value)}
                    disabled={isLoading}
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Profile chips + Recent chips for this entry */}
              {(profiles.length > 0 || history.length > 0) && (
                <div className="cf-extra-chips">
                  {profiles.map((p) => (
                    <button
                      key={`p-${p.id}`}
                      type="button"
                      className="cf-extra-profile-chip"
                      onClick={() => handleExtraLoadProfile(i, p.id)}
                      disabled={isLoading}
                      title={`${p.host}:${p.port} · ${p.user}`}
                    >
                      {p.name}
                    </button>
                  ))}
                  {history.map((h, hi) => (
                    <button
                      key={`h-${hi}`}
                      type="button"
                      className="cf-extra-history-chip"
                      onClick={() => handleExtraLoadHistory(i, h)}
                      disabled={isLoading}
                      title={`${h.host}:${h.port} · ${h.user}`}
                    >
                      {h.user}@{h.host}{h.port !== 22 ? `:${h.port}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Add host button — Save as Profile の上 */}
          <div className="cf-add-host-row">
            <button
              type="button"
              className="cf-add-host-btn"
              onClick={addExtraEntry}
              disabled={isLoading}
            >
              + Add host
            </button>
          </div>

          {/* Save as Profile */}
          <div className="cf-save-profile-row">
            {!showSaveProfile ? (
              <button
                type="button"
                className="cf-save-profile-btn"
                onClick={() => setShowSaveProfile(true)}
                disabled={isLoading}
              >
                + Save as Profile
              </button>
            ) : (
              <div className="cf-save-profile-inline">
                <input
                  type="text"
                  className="cf-profile-name-input"
                  placeholder={fields.user && fields.host ? `${fields.user}@${fields.host}` : 'Profile name'}
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveProfile();
                    if (e.key === 'Escape') setShowSaveProfile(false);
                  }}
                  autoFocus
                />
                <button type="button" className="cf-save-profile-confirm" onClick={handleSaveProfile}>
                  Save
                </button>
                <button type="button" className="cf-save-profile-cancel" onClick={() => setShowSaveProfile(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {error && <div className="cf-error" role="alert">{error}</div>}

          {/* Feature ④: Profiles section */}
          {profiles.length > 0 && (
            <div className="cf-profiles">
              <p className="cf-profiles-label">Profiles</p>
              <ul className="cf-profiles-list">
                {profiles.map((p) => (
                  <li key={p.id} className="cf-profile-item">
                    <button
                      type="button"
                      className="cf-profile-load"
                      onClick={() => handleLoadProfile(p.id)}
                      disabled={isLoading}
                    >
                      <span className="cf-profile-name">{p.name}</span>
                      <span className="cf-profile-detail">{p.host}:{p.port} · {p.user}</span>
                    </button>
                    <button
                      type="button"
                      className="cf-profile-delete"
                      onClick={() => deleteProfile(p.id)}
                      title="Delete profile"
                      disabled={isLoading}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {history.length > 0 && (
            <div className="cf-history">
              <div className="cf-history-header">
                <p className="cf-history-label">Recent</p>
                {history.length > 5 && onShowLogs && (
                  <button type="button" className="cf-history-view-all" onClick={onShowLogs}>
                    View all ({history.length}) →
                  </button>
                )}
              </div>
              <ul className="cf-history-list">
                {history.slice(0, 5).map((entry, i) => (
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

        {/* Footer links */}
        <div className="cf-footer-links">
          {onShowSessions && (
            <button className="cf-sessions-btn" onClick={onShowSessions}>
              View active sessions →
            </button>
          )}
          {onShowLogs && (
            <button className="cf-sessions-btn" onClick={onShowLogs}>
              View logs →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
