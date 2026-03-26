/**
 * Shared localStorage helpers with safe JSON serialization.
 * All storage keys use the "conduit-" prefix for namespacing.
 */

/** Read a JSON value from localStorage. Returns fallback on any failure. */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write a JSON value to localStorage. Silently ignores write failures. */
export function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable or quota exceeded — silently ignore
  }
}

/** Remove a key from localStorage. Silently ignores failures. */
export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
