import { useEffect, useCallback } from 'react';
import {
  VscNewFile,
  VscFile,
  VscChevronRight,
  VscChevronDown,
} from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';
import { useUIStore } from '../stores/uiStore';
import { ThemeToggle } from './ThemeToggle';

export function Sidebar() {
  const notes = useNoteStore((s) => s.notes);
  const activeNote = useNoteStore((s) => s.activeNote);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const openNote = useNoteStore((s) => s.openNote);
  const createNote = useNoteStore((s) => s.createNote);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleNewNote = useCallback(() => {
    const title = `Untitled ${new Date().toISOString().slice(0, 10)}`;
    createNote(title);
  }, [createNote]);

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
            <VscChevronDown size={16} className="rotate-90" />
          </button>
        </div>
      </div>

      {/* New note button */}
      <div className="px-3 py-2">
        <button
          onClick={handleNewNote}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md
                     text-text-muted dark:text-text-muted-dark
                     hover:bg-border dark:hover:bg-border-dark transition-colors"
        >
          <VscNewFile size={16} />
          New Note
        </button>
      </div>

      {/* Note list */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        <ul className="space-y-0.5">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                onClick={() => openNote(note.id)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md
                  transition-colors text-left truncate
                  ${
                    activeNote?.id === note.id
                      ? 'bg-accent/10 text-accent dark:text-accent'
                      : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                  }`}
              >
                <VscFile size={14} className="shrink-0" />
                <span className="truncate">{note.title}</span>
              </button>
            </li>
          ))}
        </ul>
        {notes.length === 0 && (
          <p className="text-xs text-text-muted dark:text-text-muted-dark px-3 py-4">
            No notes yet. Create one to get started.
          </p>
        )}
      </nav>

      {/* Footer with keyboard shortcut hint */}
      <div className="px-4 py-2 border-t border-border dark:border-border-dark">
        <p className="text-xs text-text-muted dark:text-text-muted-dark">
          <kbd className="px-1 py-0.5 rounded bg-border dark:bg-border-dark text-[10px]">
            Ctrl+K
          </kbd>{' '}
          Search
        </p>
      </div>
    </aside>
  );
}
