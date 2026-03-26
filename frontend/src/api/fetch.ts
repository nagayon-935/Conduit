import type { ApiError } from '../types';

/**
 * Thin wrapper around fetch that:
 * - Throws an Error with the server's error message on non-ok responses
 * - Supports an optional AbortSignal
 */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    let message = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const body: ApiError = await response.json();
      if (body.error) message = body.error;
    } catch {
      // keep the HTTP status message
    }
    throw new Error(message);
  }

  // 204 No Content — return undefined cast as T
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}
