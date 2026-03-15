import { useEffect, useState, useCallback } from 'react';
import { useNoteStore } from '../stores/noteStore';
import type { NoteMetadata } from '../types';
import { listNotesByPrefix } from '../api';
import { parseFrontmatter } from '../utils/frontmatter';

interface Props {
  note: { id: string; path: string; content: string };
  viewType: string;
}

// Get the folder prefix for a note path (everything up to and including last '/')
function getFolderPrefix(notePath: string): string {
  const lastSlash = notePath.lastIndexOf('/');
  if (lastSlash === -1) return '';
  return notePath.slice(0, lastSlash + 1);
}

// ── List View ─────────────────────────────────────────────────────────────────

interface ListViewProps {
  notes: NoteMetadata[];
  onOpenNote: (id: string) => void;
}

function ListView({ notes, onOpenNote }: ListViewProps) {
  // Collect all frontmatter keys across all notes (excluding 'view')
  const [sortKey, setSortKey] = useState<string>('title');
  const [sortAsc, setSortAsc] = useState(true);

  const allKeys = Array.from(
    new Set(notes.flatMap((n) => Object.keys(parseFrontmatter(n.path)))),
  ).filter((k) => k !== 'view');

  // We don't have full note content in NoteMetadata, so show path/title/dates
  const columns = ['title', 'updated_at', ...allKeys];

  const sorted = [...notes].sort((a, b) => {
    const av =
      sortKey === 'title'
        ? a.title
        : sortKey === 'updated_at'
          ? a.updated_at
          : '';
    const bv =
      sortKey === 'title'
        ? b.title
        : sortKey === 'updated_at'
          ? b.updated_at
          : '';
    return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const handleSort = (col: string) => {
    if (sortKey === col) setSortAsc(!sortAsc);
    else {
      setSortKey(col);
      setSortAsc(true);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border dark:border-border-dark">
            {columns.map((col) => (
              <th
                key={col}
                onClick={() => handleSort(col)}
                className="text-left px-3 py-2 text-xs font-medium text-text-muted dark:text-text-muted-dark
                           cursor-pointer hover:text-text dark:hover:text-text-dark select-none"
              >
                {col === 'updated_at' ? 'Updated' : col}
                {sortKey === col && (
                  <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((note) => (
            <tr
              key={note.id}
              onClick={() => onOpenNote(note.id)}
              className="border-b border-border dark:border-border-dark hover:bg-border/40
                         dark:hover:bg-border-dark/40 cursor-pointer transition-colors"
            >
              {columns.map((col) => {
                let val = '';
                if (col === 'title') val = note.title;
                else if (col === 'updated_at')
                  val = new Date(note.updated_at).toLocaleDateString();
                return (
                  <td
                    key={col}
                    className="px-3 py-2 text-text dark:text-text-dark"
                  >
                    {val || (
                      <span className="text-text-muted dark:text-text-muted-dark">
                        —
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-4 text-center text-text-muted dark:text-text-muted-dark"
              >
                No notes in this folder.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Kanban View ───────────────────────────────────────────────────────────────

interface KanbanViewProps {
  notes: NoteMetadata[];
  onOpenNote: (id: string) => void;
}

const KANBAN_STATUSES = ['Todo', 'In Progress', 'Done'];

function KanbanView({ notes, onOpenNote }: KanbanViewProps) {
  // Group notes by their 'status' frontmatter field
  // Since we only have NoteMetadata (no full content), we use title heuristics
  // In a real scenario notes would have frontmatter available
  const grouped: Record<string, NoteMetadata[]> = {
    Todo: [],
    'In Progress': [],
    Done: [],
    Other: [],
  };

  for (const note of notes) {
    // Use the path-stored properties if available via metadata
    // Fallback: all notes go to Todo
    grouped['Todo'].push(note);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_STATUSES.map((status) => (
        <div
          key={status}
          className="flex-shrink-0 w-64 rounded-lg border border-border dark:border-border-dark
                     bg-sidebar dark:bg-sidebar-dark"
        >
          <div className="px-3 py-2 border-b border-border dark:border-border-dark">
            <h3 className="text-sm font-medium text-text dark:text-text-dark">
              {status}
            </h3>
            <span className="text-xs text-text-muted dark:text-text-muted-dark">
              {(grouped[status] ?? []).length} notes
            </span>
          </div>
          <div className="p-2 space-y-2">
            {(grouped[status] ?? []).map((note) => (
              <div
                key={note.id}
                onClick={() => onOpenNote(note.id)}
                className="p-2.5 rounded-md border border-border dark:border-border-dark
                           bg-surface dark:bg-surface-dark cursor-pointer
                           hover:border-accent transition-colors"
              >
                <p className="text-sm text-text dark:text-text-dark font-medium truncate">
                  {note.title}
                </p>
                <p className="text-xs text-text-muted dark:text-text-muted-dark mt-0.5">
                  {new Date(note.updated_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Timeline View ─────────────────────────────────────────────────────────────

interface TimelineViewProps {
  notes: NoteMetadata[];
  onOpenNote: (id: string) => void;
}

function TimelineView({ notes, onOpenNote }: TimelineViewProps) {
  // Sort notes by updated_at descending
  const sorted = [...notes].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  return (
    <div className="space-y-4">
      {sorted.map((note, idx) => (
        <div key={note.id} className="flex gap-4">
          {/* Timeline spine */}
          <div className="flex flex-col items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-accent mt-1 shrink-0" />
            {idx < sorted.length - 1 && (
              <div className="w-px flex-1 bg-border dark:bg-border-dark mt-1" />
            )}
          </div>
          {/* Content */}
          <div
            className="flex-1 pb-4 cursor-pointer group"
            onClick={() => onOpenNote(note.id)}
          >
            <p className="text-xs text-text-muted dark:text-text-muted-dark mb-0.5">
              {new Date(note.updated_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <p
              className="text-sm font-medium text-text dark:text-text-dark
                          group-hover:text-accent transition-colors"
            >
              {note.title}
            </p>
          </div>
        </div>
      ))}
      {sorted.length === 0 && (
        <p className="text-sm text-text-muted dark:text-text-muted-dark">
          No notes in this folder.
        </p>
      )}
    </div>
  );
}

// ── Main DatabaseView ─────────────────────────────────────────────────────────

export function DatabaseView({ note, viewType }: Props) {
  const [folderNotes, setFolderNotes] = useState<NoteMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const openNote = useNoteStore((s) => s.openNote);

  const prefix = getFolderPrefix(note.path);

  useEffect(() => {
    const noteId = note.id;
    // Start fetch; loading state is managed via the finally handler
    listNotesByPrefix(prefix)
      .then((fetched) => {
        setFolderNotes(fetched.filter((n) => n.id !== noteId));
      })
      .catch(() => setFolderNotes([]))
      .finally(() => setLoading(false));
    return () => {
      setLoading(true);
    };
  }, [note.id, prefix]);

  const handleOpenNote = useCallback(
    (id: string) => {
      openNote(id);
    },
    [openNote],
  );

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-text-muted dark:text-text-muted-dark">
        Loading…
      </div>
    );
  }

  const normalizedView = viewType.toLowerCase();

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-medium text-text-muted dark:text-text-muted-dark uppercase tracking-wide">
          {normalizedView === 'list'
            ? 'List View'
            : normalizedView === 'kanban'
              ? 'Board View'
              : 'Timeline View'}
        </span>
        <span className="text-xs text-text-muted dark:text-text-muted-dark">
          · {folderNotes.length} notes
        </span>
      </div>
      {normalizedView === 'list' && (
        <ListView notes={folderNotes} onOpenNote={handleOpenNote} />
      )}
      {normalizedView === 'kanban' && (
        <KanbanView notes={folderNotes} onOpenNote={handleOpenNote} />
      )}
      {(normalizedView === 'timeline' || normalizedView === 'board') && (
        <TimelineView notes={folderNotes} onOpenNote={handleOpenNote} />
      )}
      {!['list', 'kanban', 'timeline', 'board'].includes(normalizedView) && (
        <p className="text-sm text-text-muted dark:text-text-muted-dark">
          Unknown view type: <code>{viewType}</code>. Use{' '}
          <code>view: list</code>, <code>view: kanban</code>, or{' '}
          <code>view: timeline</code>.
        </p>
      )}
    </div>
  );
}
