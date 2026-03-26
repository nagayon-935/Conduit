import { useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { themes, defaultThemeKey, type Theme } from '../themes';

const FONT_SIZE_KEY = 'conduit-fontSize';
const THEME_KEY = 'conduit-theme';

function readFontSize(): number {
  try {
    const raw = localStorage.getItem(FONT_SIZE_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n >= 8 && n <= 32) return n;
    }
  } catch {
    // ignore
  }
  return 14;
}

function readThemeKey(): string {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw && themes[raw]) return raw;
  } catch {
    // ignore
  }
  return defaultThemeKey;
}

function themeToXterm(t: Theme) {
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.cursor,
    selectionBackground: t.selectionBackground,
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite,
  };
}

interface UseTerminalOptions {
  themeKey?: string;
}

interface UseTerminalReturn {
  terminalRef: React.RefObject<HTMLDivElement>;
  terminal: Terminal | null;
  fitAddon: FitAddon | null;
  searchAddon: SearchAddon | null;
  initTerminal: () => void;
  disposeTerminal: () => void;
  writeToTerminal: (data: string | Uint8Array) => void;
  resizePTY: () => { cols: number; rows: number } | null;
  changeFontSize: (delta: number) => void;
  setTheme: (key: string) => void;
  currentThemeKey: string;
  search: (query: string, options?: { findNext?: boolean }) => boolean;
}

export function useTerminal(options: UseTerminalOptions = {}): UseTerminalReturn {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [fitAddon, setFitAddon] = useState<FitAddon | null>(null);
  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const [currentThemeKey, setCurrentThemeKey] = useState<string>(
    options.themeKey ?? readThemeKey(),
  );

  // Keep mutable refs so callbacks always have access to current values
  // without needing to re-create callbacks on every render
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonInstanceRef = useRef<FitAddon | null>(null);
  const searchAddonInstanceRef = useRef<SearchAddon | null>(null);
  const currentThemeKeyRef = useRef<string>(currentThemeKey);

  const initTerminal = useCallback(() => {
    if (!terminalRef.current) return;
    // Avoid double-init
    if (terminalInstanceRef.current) return;

    const initialFontSize = readFontSize();
    const initialThemeKey = options.themeKey ?? readThemeKey();
    const themeObj = themes[initialThemeKey] ?? themes[defaultThemeKey];

    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: initialFontSize,
      cursorBlink: true,
      theme: themeToXterm(themeObj),
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
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

    // ResizeObserver でコンテナのサイズ変化（display:none→flex 切替含む）を検知して fit()
    const ro = new ResizeObserver(() => {
      if (terminalRef.current && terminalRef.current.offsetParent !== null) {
        fit.fit();
      }
    });
    ro.observe(terminalRef.current);

    (term as Terminal & { _resizeObserver?: ResizeObserver })._resizeObserver = ro;

    terminalInstanceRef.current = term;
    fitAddonInstanceRef.current = fit;
    searchAddonInstanceRef.current = search;
    currentThemeKeyRef.current = initialThemeKey;
    setTerminal(term);
    setFitAddon(fit);
    setSearchAddon(search);
    setCurrentThemeKey(initialThemeKey);
  }, [options.themeKey]);

  const disposeTerminal = useCallback(() => {
    const term = terminalInstanceRef.current;
    const fit = fitAddonInstanceRef.current;

    if (term) {
      const ro = (term as Terminal & { _resizeObserver?: ResizeObserver })._resizeObserver;
      ro?.disconnect();
      fit?.dispose();
      term.dispose();
      terminalInstanceRef.current = null;
      fitAddonInstanceRef.current = null;
      searchAddonInstanceRef.current = null;
      setTerminal(null);
      setFitAddon(null);
      setSearchAddon(null);
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

  const changeFontSize = useCallback((delta: number) => {
    const term = terminalInstanceRef.current;
    const fit = fitAddonInstanceRef.current;
    if (!term || !fit) return;
    const current = term.options.fontSize ?? 14;
    const next = Math.min(32, Math.max(8, current + delta));
    term.options.fontSize = next;
    fit.fit();
    try {
      localStorage.setItem(FONT_SIZE_KEY, String(next));
    } catch {
      // ignore
    }
  }, []);

  const setTheme = useCallback((key: string) => {
    const term = terminalInstanceRef.current;
    const themeObj = themes[key] ?? themes[defaultThemeKey];
    const resolvedKey = themes[key] ? key : defaultThemeKey;
    if (term) {
      term.options.theme = themeToXterm(themeObj);
    }
    currentThemeKeyRef.current = resolvedKey;
    setCurrentThemeKey(resolvedKey);
    try {
      localStorage.setItem(THEME_KEY, resolvedKey);
    } catch {
      // ignore
    }
  }, []);

  const search = useCallback(
    (query: string, searchOptions?: { findNext?: boolean }): boolean => {
      const sa = searchAddonInstanceRef.current;
      if (!sa || !query) return false;
      if (searchOptions?.findNext) {
        return sa.findNext(query);
      }
      return sa.findPrevious(query);
    },
    [],
  );

  return {
    terminalRef,
    terminal,
    fitAddon,
    searchAddon,
    initTerminal,
    disposeTerminal,
    writeToTerminal,
    resizePTY,
    changeFontSize,
    setTheme,
    currentThemeKey,
    search,
  };
}
