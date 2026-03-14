import { useEffect, useRef, useCallback } from 'react';
import { Layout } from './components/Layout';
import { CommandPalette } from './components/CommandPalette';
import { ToastContainer } from './components/Toast';
import { useUIStore } from './stores/uiStore';
import { useNoteStore } from './stores/noteStore';

function App() {
  const theme = useUIStore((s) => s.theme);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const addToast = useUIStore((s) => s.addToast);
  const createNote = useNoteStore((s) => s.createNote);
  const activeNote = useNoteStore((s) => s.activeNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);

  // Keep a ref to editor content for Ctrl+S force-save.
  // The Editor component manages its own debounce; we expose a save trigger via store.
  const activeSaveRef = useRef<(() => void) | null>(null);

  // Apply theme class to document root
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.metaKey || e.ctrlKey;

      if (ctrl && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      } else if (ctrl && e.key === 'n') {
        e.preventDefault();
        const title = `Untitled ${new Date().toISOString().slice(0, 10)}`;
        createNote(title);
      } else if (ctrl && e.key === 's') {
        e.preventDefault();
        // Trigger force-save if a note is open
        if (activeSaveRef.current) {
          activeSaveRef.current();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCommandPalette, createNote, activeNote, updateNote]);

  // WebSocket connection — reconnect on disconnect
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      ws = new WebSocket(`${proto}//${host}/api/ws`);

      ws.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data as string) as {
            type: string;
            path: string;
          };
          if (
            event.type === 'file_created' ||
            event.type === 'file_modified' ||
            event.type === 'file_deleted'
          ) {
            // Refresh notes list when the filesystem changes
            fetchNotes();
            if (event.type === 'file_created') {
              addToast('info', `New file detected: ${event.path}`);
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!closed) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [fetchNotes, addToast]);

  // Expose save trigger to global ref so keyboard shortcut can call it
  const handleEditorSave = useCallback((saveFn: () => void) => {
    activeSaveRef.current = saveFn;
  }, []);

  return (
    <div className="h-full bg-surface dark:bg-surface-dark">
      <Layout onEditorSave={handleEditorSave} />
      <CommandPalette />
      <ToastContainer />
    </div>
  );
}

export default App;
