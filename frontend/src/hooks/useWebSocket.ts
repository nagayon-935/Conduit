import { useRef, useState, useCallback, useEffect } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { WsControlMessage } from '../types';

interface UseWebSocketOptions {
  token: string;
  terminal: Terminal | null;
  fitAddon: FitAddon | null;
  onDisconnect: () => void;
  onError: (msg: string) => void;
}

interface UseWebSocketReturn {
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2000;

function buildWsUrl(token: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const { token, terminal, fitAddon, onDisconnect, onError } = options;

  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const isIntentionalCloseRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest terminal/fitAddon in refs so WebSocket callbacks use current values
  const terminalRef = useRef<Terminal | null>(terminal);
  const fitAddonRef = useRef<FitAddon | null>(fitAddon);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  useEffect(() => { terminalRef.current = terminal; }, [terminal]);
  useEffect(() => { fitAddonRef.current = fitAddon; }, [fitAddon]);
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current !== null) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback((ws: WebSocket) => {
    clearHeartbeat();
    heartbeatIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' } satisfies WsControlMessage));
      }
    }, 30000);
  }, [clearHeartbeat]);

  const connectInternal = useCallback((isReconnect: boolean) => {
    // Close any existing connection first
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = buildWsUrl(token);
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
      startHeartbeat(ws);

      if (isReconnect) {
        terminalRef.current?.writeln('\r\n\x1b[32m[Conduit] Reconnected.\x1b[0m');
      }

      // Send initial terminal size
      const term = terminalRef.current;
      const fit = fitAddonRef.current;
      if (term && fit) {
        fit.fit();
        const resizeMsg: WsControlMessage = { type: 'resize', cols: term.cols, rows: term.rows };
        ws.send(JSON.stringify(resizeMsg));
      }

      // Wire up terminal input → WebSocket
      if (term) {
        term.onData((data: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        // Wire up terminal resize → WebSocket
        term.onResize(({ cols, rows }) => {
          if (ws.readyState === WebSocket.OPEN) {
            const resizeMsg: WsControlMessage = { type: 'resize', cols, rows };
            ws.send(JSON.stringify(resizeMsg));
          }
        });
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      const term = terminalRef.current;
      if (!term) return;

      if (typeof event.data === 'string') {
        // Try to parse as a control message
        try {
          const msg: WsControlMessage = JSON.parse(event.data) as WsControlMessage;
          if (msg && typeof msg === 'object' && 'type' in msg) {
            switch (msg.type) {
              case 'ping':
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'pong' } satisfies WsControlMessage));
                }
                return;
              case 'pong':
                return;
              case 'error':
                onErrorRef.current(msg.message);
                return;
              case 'resize':
                // Server-initiated resize — ignore or handle as needed
                return;
            }
          }
        } catch {
          // Not JSON — fall through to write as text
        }
        term.write(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
      }
    };

    ws.onerror = () => {
      // onerror is always followed by onclose; handle reconnect there
    };

    ws.onclose = () => {
      clearHeartbeat();
      setIsConnected(false);
      wsRef.current = null;

      if (isIntentionalCloseRef.current) {
        onDisconnectRef.current();
        return;
      }

      // Attempt reconnection
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const attempt = reconnectAttemptsRef.current;
        reconnectAttemptsRef.current += 1;
        const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt);

        terminalRef.current?.writeln('\r\n\x1b[33m[Conduit] Reconnecting...\x1b[0m');

        reconnectTimeoutRef.current = setTimeout(() => {
          connectInternal(true);
        }, delay);
      } else {
        terminalRef.current?.writeln('\r\n\x1b[31m[Conduit] Connection lost. Max reconnect attempts reached.\x1b[0m');
        onErrorRef.current('Connection lost after maximum reconnect attempts.');
        onDisconnectRef.current();
      }
    };
  }, [token, startHeartbeat, clearHeartbeat]);

  const connect = useCallback(() => {
    isIntentionalCloseRef.current = false;
    reconnectAttemptsRef.current = 0;
    clearReconnectTimeout();
    connectInternal(false);
  }, [connectInternal, clearReconnectTimeout]);

  const disconnect = useCallback(() => {
    isIntentionalCloseRef.current = true;
    clearHeartbeat();
    clearReconnectTimeout();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [clearHeartbeat, clearReconnectTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isIntentionalCloseRef.current = true;
      clearHeartbeat();
      clearReconnectTimeout();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clearHeartbeat, clearReconnectTimeout]);

  return { connect, disconnect, isConnected };
}
