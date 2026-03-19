import { useEffect, useRef, useCallback, useState } from 'react';
import ReconnectingWebSocket from 'partysocket/ws';
import { Layout } from './components/Layout';
import { CommandPalette } from './components/CommandPalette';
import { ToastContainer } from './components/Toast';
import { LoginPage } from './components/LoginPage';
import { SettingsPage } from './components/SettingsPage';
import { CalendarView } from './components/CalendarView';
import { useUIStore } from './stores/uiStore';
import { useNoteStore } from './stores/noteStore';
import { useAuthStore } from './stores/authStore';
import { useSettingsStore, DEFAULT_SHORTCUTS } from './stores/settingsStore';

function App() {
  const authUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const checkSession = useAuthStore((s) => s.checkSession);
  const theme = useUIStore((s) => s.theme);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const addToast = useUIStore((s) => s.addToast);
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const createNote = useNoteStore((s) => s.createNote);
  const activeNote = useNoteStore((s) => s.activeNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);

  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const isCalendarPage = currentPath === '/calendar';

  // Start as connected (no indicator shown). Only show indicator after an
  // unexpected disconnect — not on initial connection or clean closes.
  const [wsConnected, setWsConnected] = useState(true);
  const hasConnectedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref to editor content for Ctrl+S force-save.
  // The Editor component manages its own debounce; we expose a save trigger via store.
  const activeSaveRef = useRef<(() => void) | null>(null);
  const focusTitleRef = useRef<(() => void) | null>(null);

  // Check for existing session on mount.
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Apply theme class to document root
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Global keyboard shortcuts
  useEffect(() => {
    function keyToString(e: KeyboardEvent): string {
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
      return parts.join('+');
    }

    function boundKey(action: string): string {
      return shortcuts[action] ?? DEFAULT_SHORTCUTS[action]?.defaultKey ?? '';
    }

    function handleKeyDown(e: KeyboardEvent) {
      const pressed = keyToString(e);
      const paletteKey = boundKey('command-palette');
      // Command palette supports two default bindings
      if (
        pressed === paletteKey ||
        (!(shortcuts['command-palette']) && (pressed === 'Ctrl+K' || pressed === 'Ctrl+P'))
      ) {
        e.preventDefault();
        toggleCommandPalette();
      } else if (pressed === boundKey('new-note')) {
        e.preventDefault();
        const title = `Untitled ${new Date().toISOString().slice(0, 10)}`;
        createNote(title);
      } else if (pressed === boundKey('save')) {
        e.preventDefault();
        if (activeSaveRef.current) {
          activeSaveRef.current();
        }
      } else if (pressed === boundKey('focus-title')) {
        e.preventDefault();
        focusTitleRef.current?.();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCommandPalette, createNote, activeNote, updateNote, shortcuts]);

  // WebSocket connection — auto-reconnects via ReconnectingWebSocket.
  // The reconnecting indicator is only shown after an unexpected disconnect
  // (not on initial connect or clean closes), and only after a 2-second delay
  // so brief reconnects are invisible.
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new ReconnectingWebSocket(`${proto}//${host}/api/ws`);

    const scheduleReconnecting = () => {
      if (reconnectTimerRef.current === null) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          setWsConnected(false);
        }, 3000);
      }
    };

    ws.onopen = () => {
      hasConnectedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setWsConnected(true);
    };

    ws.onerror = () => {
      // Only show indicator if we've connected before (not on initial attempt).
      if (hasConnectedRef.current) {
        scheduleReconnecting();
      }
    };

    ws.onclose = (ev) => {
      // Only show indicator after first connect and only on unexpected closes.
      // Codes 1000 (Normal Closure) and 1001 (Going Away) are expected.
      if (
        hasConnectedRef.current &&
        !ev.wasClean &&
        ev.code !== 1000 &&
        ev.code !== 1001
      ) {
        scheduleReconnecting();
      }
    };

    ws.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data as string) as {
          type: string;
          path?: string;
          note_id?: string;
          title?: string;
          status?: string;
        };
        if (
          event.type === 'file_created' ||
          event.type === 'file_modified' ||
          event.type === 'file_deleted'
        ) {
          fetchNotes();
          if (event.type === 'file_created') {
            addToast('info', `New file detected: ${event.path}`);
          }
        } else if (
          event.type === 'status_changed' &&
          event.title &&
          event.status
        ) {
          addToast('info', `Note '${event.title}' marked as ${event.status}`);
          // Dispatch custom event for AutomationLog to pick up
          window.dispatchEvent(
            new CustomEvent('thynk:automation', {
              detail: { title: event.title, status: event.status },
            }),
          );
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      ws.close();
    };
  }, [fetchNotes, addToast]);

  // Expose save trigger to global ref so keyboard shortcut can call it
  const handleEditorSave = useCallback((saveFn: () => void) => {
    activeSaveRef.current = saveFn;
  }, []);

  // Expose focusTitle trigger to global ref so F2 can call it
  const handleRegisterFocusTitle = useCallback((fn: () => void) => {
    focusTitleRef.current = fn;
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname;
      setCurrentPath(pathname);
      setSettingsOpen(pathname === '/settings');
      if (pathname === '/calendar') return;
      const match = pathname.match(/^\/notes\/(.+)$/);
      if (match) {
        const path = decodeURIComponent(match[1]);
        void openNoteByPath(path);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [openNoteByPath, setSettingsOpen]);

  // Open note from URL on initial page load
  useEffect(() => {
    const match = window.location.pathname.match(/^\/notes\/(.+)$/);
    if (match) {
      const path = decodeURIComponent(match[1]);
      openNoteByPath(path);
    }
    if (window.location.pathname === '/settings') {
      setSettingsOpen(true);
    }
  }, [openNoteByPath, setSettingsOpen]);

  // Show nothing while checking session to avoid flash.
  if (authLoading) {
    return (
      <div className="h-full bg-surface dark:bg-surface-dark flex items-center justify-center">
        <span className="text-sm text-text-muted dark:text-text-muted-dark">
          Loading…
        </span>
      </div>
    );
  }

  // Show login if not authenticated.
  if (!authUser) {
    return <LoginPage />;
  }

  return (
    <div className="h-full bg-surface dark:bg-surface-dark">
      <Layout
        onEditorSave={handleEditorSave}
        onRegisterFocusTitle={handleRegisterFocusTitle}
      />
      <CommandPalette />
      <ToastContainer />
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="w-[640px] max-w-[95vw] max-h-[90vh] overflow-hidden rounded-xl shadow-xl
                        border border-border dark:border-border-dark"
          >
            <SettingsPage onClose={() => {
              setSettingsOpen(false);
              window.history.back();
            }} />
          </div>
        </div>
      )}
      {isCalendarPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="w-[900px] max-w-[95vw] h-[600px] max-h-[90vh] rounded-xl shadow-xl
                        overflow-hidden border border-border dark:border-border-dark"
          >
            <CalendarView onClose={() => window.history.back()} />
          </div>
        </div>
      )}
      {!wsConnected && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5
                         rounded-full text-xs bg-yellow-500/90 text-white shadow-lg"
        >
          <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-white inline-block" />
          Reconnecting…
        </div>
      )}
    </div>
  );
}

export default App;
