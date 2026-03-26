import { useState, useEffect } from 'react';

interface LogEntry {
  id: string;
  host: string;
  port: number;
  user: string;
  connected_at: string;
  disconnected_at?: string;
}

interface LogPageProps {
  onBack: () => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function LogPage({ onBack }: LogPageProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/logs');
        if (!res.ok) throw new Error(`Failed to fetch logs: ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setEntries(data ?? []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load logs');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#1a1b26', color: '#c0caf5' }}>
      {/* Nav */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        height: '60px',
        background: '#16161e',
        borderBottom: '1px solid #1e2030',
        flexShrink: 0,
        gap: '16px',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: '1px solid #2a2c3d',
            borderRadius: '6px',
            color: '#7aa2f7',
            fontSize: '14px',
            padding: '6px 14px',
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#c0caf5' }}>Connection Log</span>
      </header>

      {/* Main */}
      <main style={{ flex: 1, padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {loading && (
          <p style={{ color: '#565f89', textAlign: 'center', marginTop: '48px' }}>Loading…</p>
        )}

        {error && (
          <div style={{
            background: 'rgba(247,118,142,0.08)',
            border: '1px solid rgba(247,118,142,0.25)',
            borderRadius: '8px',
            color: '#f7768e',
            padding: '12px 16px',
            marginBottom: '20px',
          }}>
            {error}
          </div>
        )}

        {!loading && entries.length === 0 && !error && (
          <div style={{ textAlign: 'center', marginTop: '64px', color: '#565f89' }}>
            <p style={{ fontSize: '16px' }}>No connection history yet.</p>
            <p style={{ fontSize: '13px', marginTop: '8px' }}>Connections will appear here once you connect to an SSH server.</p>
          </div>
        )}

        {entries.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
            }}>
              <thead>
                <tr style={{ background: '#24283b' }}>
                  {['Host', 'Port', 'User', 'Connected At', 'Disconnected At'].map((col) => (
                    <th key={col} style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      color: '#c0caf5',
                      fontWeight: 600,
                      borderBottom: '1px solid #1e2030',
                      whiteSpace: 'nowrap',
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #1e2030' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: '#7aa2f7' }}>{e.host}</td>
                    <td style={{ padding: '10px 16px', color: '#c0caf5' }}>{e.port}</td>
                    <td style={{ padding: '10px 16px', color: '#9ece6a' }}>{e.user}</td>
                    <td style={{ padding: '10px 16px', color: '#c0caf5', whiteSpace: 'nowrap' }}>{formatDateTime(e.connected_at)}</td>
                    <td style={{ padding: '10px 16px', color: '#565f89', whiteSpace: 'nowrap' }}>
                      {e.disconnected_at ? formatDateTime(e.disconnected_at) : '—'}
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
