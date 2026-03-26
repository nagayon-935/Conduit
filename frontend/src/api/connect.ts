import type { ApiError, ConnectRequest, ConnectResponse } from '../types';

export async function connectToHost(req: ConnectRequest): Promise<ConnectResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch('/api/connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const apiError: ApiError = await response.json();
        errorMessage = apiError.error || errorMessage;
      } catch {
        // Failed to parse error body — keep the HTTP status message
      }
      throw new Error(errorMessage);
    }

    const data: ConnectResponse = await response.json();
    return data;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Connection timed out after 15 seconds');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
