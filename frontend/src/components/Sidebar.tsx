import { useEffect, useCallback, useState } from 'react';
import {
  VscNewFile,
  VscFile,
  VscChevronRight,
  VscChevronLeft,
  VscTrash,
} from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';
import { useUIStore } from '../stores/uiStore';
import { ThemeToggle } from './ThemeToggle';

export function Sidebar() {
  const notes = useNoteStore((s) => s.notes);
  const activeNote = useNoteStore((s) => s.activeNote);
  const loading = useNoteStore((s) => s.loading);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const openNote = useNoteStore((s) => s.openNote);
  const createNote = useNoteStore((s) => s.createNote);
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleNewNote = useCallback(() => {
    const title = `Untitled ${new Date().toISOString().slice(0, 10)}`;
    createNote(title);
  }, [createNote]);

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (confirmDeleteId === id) {
        deleteNote(id);
        setConfirmDeleteId(null);
      } else {
        setConfirmDeleteId(id);
        // Auto-cancel confirm after 3 seconds
        setTimeout(() => setConfirmDeleteId(null), 3000);
      }
    },
    [confirmDeleteId, deleteNote],
  );

  if (!sidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className="fixed top-3 left-3 z-10 p-2 rounded-md
                   bg-sidebar dark:bg-sidebar-dark
                   border border-border dark:border-border-dark
                   text-text dark:text-text-dark
                   hover:bg-border dark:hover:bg-border-dark transition-colors"
        title="Open sidebar"
      >
        <VscChevronRight size={16} />
      </button>
    );
  }

  return (
    <aside
      className="w-64 h-full flex flex-col
                 bg-sidebar dark:bg-sidebar-dark
                 border-r border-border dark:border-border-dark"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border-dark">
        <span className="text-sm font-semibold text-text dark:text-text-dark tracking-wide">
          Thynk
        </span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-md text-text-muted dark:text-text-muted-dark
                       hover:bg-border dark:hover:bg-border-dark transition-colors"
            title="Collapse sidebar"
          >
            <VscChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* New note button */}
      <div className="px-3 py-2">
        <button
          onClick={handleNewNote}
          disabled={loading}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md
                     text-text-muted dark:text-text-muted-dark
                     hover:bg-border dark:hover:bg-border-dark transition-colors
                     disabled:opacity-50"
        >
          <VscNewFile size={16} />
          New Note
        </button>
      </div>

      {/* Note list */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {loading && notes.length === 0 && (
          <p className="text-xs text-text-muted dark:text-text-muted-dark px-3 py-4">
            Loading…
          </p>
        )}
        <ul className="space-y-0.5">
          {notes.map((note) => (
            <li
              key={note.id}
              className="group relative"
              onMouseEnter={() => setHoveredId(note.id)}
              onMouseLeave={() => {
                setHoveredId(null);
                if (confirmDeleteId === note.id) setConfirmDeleteId(null);
              }}
            >
              <button
                onClick={() => openNote(note.id)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md
                  transition-colors text-left
                  ${
                    activeNote?.id === note.id
                      ? 'bg-accent/10 text-accent dark:text-accent'
                      : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                  }`}
              >
                <VscFile size={14} className="shrink-0" />
                <span className="truncate flex-1 min-w-0">{note.title}</span>
              </button>

              {/* Delete button — shows on hover */}
              {(hoveredId === note.id || confirmDeleteId === note.id) && (
                <button
                  onClick={(e) => handleDeleteClick(e, note.id)}
                  className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded
                    transition-colors text-xs
                    ${
                      confirmDeleteId === note.id
                        ? 'bg-red-500/20 text-red-500'
                        : 'text-text-muted dark:text-text-muted-dark hover:bg-red-500/10 hover:text-red-500'
                    }`}
                  title={
                    confirmDeleteId === note.id
                      ? 'Click again to confirm delete'
                      : 'Delete note'
                  }
                >
                  <VscTrash size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {notes.length === 0 && !loading && (
          <p className="text-xs text-text-muted dark:text-text-muted-dark px-3 py-4">
            No notes yet.{' '}
            <button
              onClick={handleNewNote}
              className="underline hover:text-text dark:hover:text-text-dark"
            >
              Create one
            </button>{' '}
            to get started.
          </p>
        )}
      </nav>

      {/* Footer with keyboard shortcut hint */}
      <div className="px-4 py-2 border-t border-border dark:border-border-dark flex items-center gap-2">
        <p className="text-xs text-text-muted dark:text-text-muted-dark">
          <kbd className="px-1 py-0.5 rounded bg-border dark:bg-border-dark text-[10px]">
            Ctrl+K
          </kbd>{' '}
          Search
        </p>
        <span className="text-text-muted dark:text-text-muted-dark text-xs">
          ·
        </span>
        <p className="text-xs text-text-muted dark:text-text-muted-dark">
          <kbd className="px-1 py-0.5 rounded bg-border dark:bg-border-dark text-[10px]">
            Ctrl+N
          </kbd>{' '}
          New
        </p>
      </div>
    </aside>
  );
}
