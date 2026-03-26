import { useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';

interface UseTerminalReturn {
  terminalRef: React.RefObject<HTMLDivElement>;
  terminal: Terminal | null;
  fitAddon: FitAddon | null;
  initTerminal: () => void;
  disposeTerminal: () => void;
  writeToTerminal: (data: string | Uint8Array) => void;
  resizePTY: () => { cols: number; rows: number } | null;
}

export function useTerminal(): UseTerminalReturn {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [fitAddon, setFitAddon] = useState<FitAddon | null>(null);

  // Keep mutable refs so callbacks always have access to current values
  // without needing to re-create callbacks on every render
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonInstanceRef = useRef<FitAddon | null>(null);

  const initTerminal = useCallback(() => {
    if (!terminalRef.current) return;
    // Avoid double-init
    if (terminalInstanceRef.current) return;

    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
      theme: {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        selectionBackground: '#414868',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      },
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalRef.current);

    // Attempt WebGL renderer; fall back to canvas on failure
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
      });
      term.loadAddon(webgl);
    } catch {
      // WebGL not supported — canvas renderer is used automatically
    }

    fit.fit();

    const handleResize = () => {
      fit.fit();
    };

    window.addEventListener('resize', handleResize);

    // Store a cleanup reference on the terminal instance via a custom property
    // by keeping it in the closure via a ref-like pattern
    (term as Terminal & { _resizeHandler?: () => void })._resizeHandler = handleResize;

    terminalInstanceRef.current = term;
    fitAddonInstanceRef.current = fit;
    setTerminal(term);
    setFitAddon(fit);
  }, []);

  const disposeTerminal = useCallback(() => {
    const term = terminalInstanceRef.current;
    const fit = fitAddonInstanceRef.current;

    if (term) {
      const handler = (term as Terminal & { _resizeHandler?: () => void })._resizeHandler;
      if (handler) {
        window.removeEventListener('resize', handler);
      }
      fit?.dispose();
      term.dispose();
      terminalInstanceRef.current = null;
      fitAddonInstanceRef.current = null;
      setTerminal(null);
      setFitAddon(null);
    }
  }, []);

  const writeToTerminal = useCallback((data: string | Uint8Array) => {
    terminalInstanceRef.current?.write(data);
  }, []);

  const resizePTY = useCallback((): { cols: number; rows: number } | null => {
    const term = terminalInstanceRef.current;
    const fit = fitAddonInstanceRef.current;
    if (!term || !fit) return null;
    fit.fit();
    return { cols: term.cols, rows: term.rows };
  }, []);

  return {
    terminalRef,
    terminal,
    fitAddon,
    initTerminal,
    disposeTerminal,
    writeToTerminal,
    resizePTY,
  };
}
