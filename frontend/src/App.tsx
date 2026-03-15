import { useEffect, useRef, useCallback, useState } from 'react';
import ReconnectingWebSocket from 'partysocket/ws';
import { Layout } from './components/Layout';
import { CommandPalette } from './components/CommandPalette';
import { ToastContainer } from './components/Toast';
import { LoginPage } from './components/LoginPage';
import { SettingsPage } from './components/SettingsPage';
import { useUIStore } from './stores/uiStore';
import { useNoteStore } from './stores/noteStore';
import { useAuthStore } from './stores/authStore';

function App() {
  const authUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const checkSession = useAuthStore((s) => s.checkSession);
  const theme = useUIStore((s) => s.theme);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const addToast = useUIStore((s) => s.addToast);
  const createNote = useNoteStore((s) => s.createNote);
  const activeNote = useNoteStore((s) => s.activeNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);

  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const isSettingsPage = currentPath === '/settings';

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
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.metaKey || e.ctrlKey;

      if ((ctrl && e.key === 'p') || (ctrl && e.key === 'k')) {
        e.preventDefault();
        toggleCommandPalette();
      } else if (ctrl && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        const title = `Untitled ${new Date().toISOString().slice(0, 10)}`;
        createNote(title);
      } else if (ctrl && e.key === 's') {
        e.preventDefault();
        // Trigger force-save if a note is open
        if (activeSaveRef.current) {
          activeSaveRef.current();
        }
      } else if (e.key === 'F2') {
        e.preventDefault();
        focusTitleRef.current?.();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCommandPalette, createNote, activeNote, updateNote]);

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
      const match = pathname.match(/^\/notes\/(.+)$/);
      if (match) {
        const path = decodeURIComponent(match[1]);
        openNoteByPath(path);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [openNoteByPath]);

  // Open note from URL on initial page load
  useEffect(() => {
    const match = window.location.pathname.match(/^\/notes\/(.+)$/);
    if (match) {
      const path = decodeURIComponent(match[1]);
      openNoteByPath(path);
    }
  }, [openNoteByPath]);

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

  if (isSettingsPage) {
    return (
      <div className="h-full bg-surface dark:bg-surface-dark">
        <SettingsPage />
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="h-full bg-surface dark:bg-surface-dark">
      <Layout
        onEditorSave={handleEditorSave}
        onRegisterFocusTitle={handleRegisterFocusTitle}
      />
      <CommandPalette />
      <ToastContainer />
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
