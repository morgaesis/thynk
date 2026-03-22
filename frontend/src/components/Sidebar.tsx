import { useEffect, useCallback, useState, useMemo } from 'react';
import {
  VscNewFile,
  VscFile,
  VscChevronRight,
  VscChevronLeft,
  VscTrash,
  VscFolder,
  VscChevronDown,
  VscStarEmpty,
  VscStarFull,
  VscLayoutMenubar,
  VscSettingsGear,
  VscTypeHierarchySub,
  VscCalendar,
  VscGripper,
} from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { ThemeToggle } from './ThemeToggle';
import { TagBrowser, TagFilteredNotes } from './TagBrowser';
import { DailyNoteCalendar } from './DailyNoteCalendar';
import { TemplateSelector } from './TemplateSelector';
import { AutomationLog } from './AutomationLog';
import { NotificationsBell } from './NotificationsBell';
import { ActivityFeed } from './ActivityFeed';
import { useAutomationEvents } from '../hooks/useAutomationEvents';
import { BacklinksPanel } from './BacklinksPanel';
import type { TreeNode, NoteMetadata } from '../types';
import {
  getTree,
  toggleFavorite,
  getFavorites,
  moveNote,
  getNoteByPath,
  listTrashedNotes,
  restoreNote,
  permanentDeleteNote,
  type TrashedNote,
} from '../api';

// Count files in a directory node (hoisted outside TreeItem to avoid recreation)
function countFiles(n: TreeNode): number {
  if (!n.children) return 1;
  return n.children.reduce((sum, c) => sum + countFiles(c), 0);
}

function TreeItem({
  node,
  path,
  level = 0,
  collapseSignal,
  notesByPath,
}: {
  node: TreeNode;
  path: string;
  level?: number;
  collapseSignal?: number;
  notesByPath: Map<string, NoteMetadata>;
}) {
  const [expanded, setExpanded] = useState(true);
  const isDir = node.children !== undefined;
  const activeNote = useNoteStore((s) => s.activeNote);
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const addToast = useUIStore((s) => s.addToast);
  const setShowGraph = useUIStore((s) => s.setShowGraph);
  const [hoveredPath, setHoveredPath] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [favoriting, setFavoriting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Collapse when signal changes
  useEffect(() => {
    if (collapseSignal !== undefined && collapseSignal > 0) {
      setExpanded(false);
    }
  }, [collapseSignal]);

  if (isDir) {
    return (
      <li>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 w-full px-3 py-1 text-xs font-medium
                     text-text-muted dark:text-text-muted-dark hover:bg-border
                     dark:hover:bg-border-dark rounded-md transition-colors"
          style={{ paddingLeft: `${12 + level * 12}px` }}
        >
          {expanded ? (
            <VscChevronDown size={12} />
          ) : (
            <VscChevronRight size={12} />
          )}
          <VscFolder size={13} className="shrink-0" />
          <span className="truncate">{node.name}</span>
          <span className="ml-auto text-[10px] text-text-muted dark:text-text-muted-dark opacity-60">
            {countFiles(node)}
          </span>
        </button>
        {expanded && (
          <ul>
            {node.children!.map((child) => (
              <TreeItem
                key={child.name}
                node={child}
                path={path ? `${path}/${child.name}` : child.name}
                level={level + 1}
                collapseSignal={collapseSignal}
                notesByPath={notesByPath}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  // File node
  const noteMeta = notesByPath.get(path);
  const isActive = activeNote?.path === path;
  const isFavorited = noteMeta?.favorited ?? false;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete && noteMeta) {
      deleteNote(noteMeta.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!noteMeta || favoriting) return;
    setFavoriting(true);
    try {
      await toggleFavorite(noteMeta.id);
      await fetchNotes();
    } catch {
      addToast('error', 'Failed to toggle favorite');
    } finally {
      setFavoriting(false);
    }
  };

  return (
    <li
      className={`group relative ${dragOver ? 'outline outline-1 outline-accent rounded-md bg-accent/5' : ''}`}
      onMouseEnter={() => setHoveredPath(true)}
      onMouseLeave={() => setHoveredPath(false)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', path);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragOver(false);
        const sourcePath = e.dataTransfer.getData('text/plain');
        if (sourcePath && sourcePath !== path) {
          try {
            const sourceNote = await getNoteByPath(sourcePath);
            const targetDir = path.includes('/')
              ? path.split('/').slice(0, -1).join('/')
              : '';
            const sourceName =
              sourcePath.split('/').pop()?.replace('.md', '') || 'untitled';
            const newPath = targetDir
              ? `${targetDir}/${sourceName}.md`
              : `${sourceName}.md`;
            await moveNote(sourceNote.id, newPath);
            addToast('success', `Moved "${sourcePath}" → "${newPath}"`);
            await fetchNotes();
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            if (msg.includes('409') || msg.includes('already_exists')) {
              addToast('error', 'A note already exists at the destination');
            } else {
              addToast('error', `Failed to move note: ${msg}`);
            }
          }
        }
      }}
    >
      <button
        onClick={() => {
          if (noteMeta) {
            setShowGraph(false);
            void openNoteByPath(path);
          }
        }}
        className={`flex items-center gap-2 w-full py-1.5 text-sm rounded-md
          transition-colors text-left
          ${
            isActive
              ? 'bg-accent/10 text-accent dark:text-accent'
              : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
          }`}
        style={{ paddingLeft: `${12 + level * 12}px`, paddingRight: '68px' }}
      >
        <VscGripper
          size={12}
          className="shrink-0 text-text-muted dark:text-text-muted-dark opacity-0 group-hover:opacity-50 cursor-grab"
        />
        <VscFile size={14} className="shrink-0" />
        <span className="truncate flex-1 min-w-0">
          {node.name.replace(/\.md$/, '')}
        </span>
      </button>
      {(hoveredPath || confirmDelete) && noteMeta && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <button
            onClick={handleFavoriteClick}
            disabled={favoriting}
            className={`p-1 rounded transition-colors
              ${
                isFavorited
                  ? 'text-yellow-400 hover:text-yellow-500'
                  : 'text-text-muted dark:text-text-muted-dark hover:text-yellow-400'
              }`}
            title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFavorited ? (
              <VscStarFull size={12} />
            ) : (
              <VscStarEmpty size={12} />
            )}
          </button>
          <button
            onClick={handleDeleteClick}
            className={`p-1 rounded transition-colors
              ${
                confirmDelete
                  ? 'bg-red-500/20 text-red-500'
                  : 'text-text-muted dark:text-text-muted-dark hover:bg-red-500/10 hover:text-red-500'
              }`}
            title={
              confirmDelete ? 'Click again to confirm delete' : 'Delete note'
            }
          >
            <VscTrash size={13} />
          </button>
        </div>
      )}
    </li>
  );
}

// ── Favorites Section ─────────────────────────────────────────────────────────

function FavoritesSection() {
  const [favorites, setFavorites] = useState<NoteMetadata[]>([]);
  const [expanded, setExpanded] = useState(true);
  const notes = useNoteStore((s) => s.notes);
  const openNote = useNoteStore((s) => s.openNote);
  const activeNote = useNoteStore((s) => s.activeNote);
  const setShowGraph = useUIStore((s) => s.setShowGraph);

  useEffect(() => {
    getFavorites()
      .then(setFavorites)
      .catch(() => {});
  }, [notes]);

  if (favorites.length === 0) return null;

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-semibold
                   text-text-muted dark:text-text-muted-dark uppercase tracking-wider
                   hover:text-text dark:hover:text-text-dark transition-colors"
      >
        <VscStarFull size={12} className="text-yellow-400" />
        Favorites
        <span className="ml-auto text-[10px] normal-case font-normal">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <ul className="space-y-0.5 px-3 mb-2">
          {favorites.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => {
                  setShowGraph(false);
                  void openNote(n.id);
                }}
                className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md
                  transition-colors text-left
                  ${
                    activeNote?.id === n.id
                      ? 'bg-accent/10 text-accent dark:text-accent'
                      : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                  }`}
              >
                <VscStarFull size={12} className="shrink-0 text-yellow-400" />
                <span className="truncate">{n.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Recent Notes Section ──────────────────────────────────────────────────────

function RecentNotesSection() {
  const recentNoteIds = useUIStore((s) => s.recentNoteIds);
  const notes = useNoteStore((s) => s.notes);
  const openNote = useNoteStore((s) => s.openNote);
  const activeNote = useNoteStore((s) => s.activeNote);
  const setShowGraph = useUIStore((s) => s.setShowGraph);
  const [expanded, setExpanded] = useState(true);

  const recentNotes = recentNoteIds
    .slice(0, 5)
    .map((id) => notes.find((n) => n.id === id))
    .filter(Boolean) as NoteMetadata[];

  if (recentNotes.length === 0) return null;

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-semibold
                   text-text-muted dark:text-text-muted-dark uppercase tracking-wider
                   hover:text-text dark:hover:text-text-dark transition-colors"
      >
        <VscFile size={12} />
        Recent
        <span className="ml-auto text-[10px] normal-case font-normal">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <ul className="space-y-0.5 px-3 mb-2">
          {recentNotes.map((n) => {
            const folder = n.path.includes('/')
              ? n.path.split('/').slice(0, -1).join('/')
              : '';
            return (
              <li key={n.id}>
                <button
                  onClick={() => {
                    setShowGraph(false);
                    void openNote(n.id);
                  }}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md
                      transition-colors text-left
                      ${
                        activeNote?.id === n.id
                          ? 'bg-accent/10 text-accent dark:text-accent'
                          : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                      }`}
                >
                  <VscFile size={12} className="shrink-0" />
                  <span className="truncate">{n.title}</span>
                  {folder && (
                    <span className="ml-auto text-[10px] text-text-muted dark:text-text-muted-dark opacity-50 truncate shrink-0">
                      {folder}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Trash Section ───────────────────────────────────────────────────────────

function TrashSection() {
  const [trashedNotes, setTrashedNotes] = useState<TrashedNote[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const addToast = useUIStore((s) => s.addToast);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);

  const loadTrashedNotes = useCallback(async () => {
    try {
      const result = await listTrashedNotes();
      setTrashedNotes(result.notes);
    } catch {
      setTrashedNotes([]);
    }
  }, []);

  const handleToggle = useCallback(async () => {
    if (!expanded) {
      setLoading(true);
      await loadTrashedNotes();
      setLoading(false);
    }
    setExpanded((e) => !e);
  }, [expanded, loadTrashedNotes]);

  const handleRestore = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (restoring) return;
    setRestoring(id);
    try {
      await restoreNote(id);
      await loadTrashedNotes();
      await fetchNotes();
      addToast('success', 'Note restored');
    } catch {
      addToast('error', 'Failed to restore note');
    } finally {
      setRestoring(null);
    }
  };

  const handlePermanentDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) return;
    if (!confirm('Permanently delete this note? This cannot be undone.'))
      return;
    setDeleting(id);
    try {
      await permanentDeleteNote(id);
      await loadTrashedNotes();
      addToast('success', 'Note permanently deleted');
    } catch {
      addToast('error', 'Failed to delete note');
    } finally {
      setDeleting(null);
    }
  };

  if (trashedNotes.length === 0 && !expanded) {
    return (
      <div className="mb-1">
        <button
          onClick={handleToggle}
          className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-semibold
                     text-text-muted dark:text-text-muted-dark uppercase tracking-wider
                     hover:text-text dark:hover:text-text-dark transition-colors"
        >
          <VscTrash size={12} />
          Trash
        </button>
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-semibold
                   text-text-muted dark:text-text-muted-dark uppercase tracking-wider
                   hover:text-text dark:hover:text-text-dark transition-colors"
      >
        <VscTrash size={12} />
        Trash
        <span className="ml-auto text-[10px] normal-case font-normal">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <ul className="space-y-0.5 px-3 mb-2">
          {loading ? (
            <li className="text-xs text-text-muted dark:text-text-muted-dark px-2 py-1">
              Loading...
            </li>
          ) : trashedNotes.length === 0 ? (
            <li className="text-xs text-text-muted dark:text-text-muted-dark px-2 py-1">
              Trash is empty
            </li>
          ) : (
            trashedNotes.map((note) => (
              <li
                key={note.id}
                className="group flex items-center gap-1 px-2 py-1.5 text-sm rounded-md
                           text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark"
              >
                <VscTrash size={12} className="shrink-0 text-text-muted" />
                <span className="truncate flex-1">{note.title}</span>
                <button
                  onClick={(e) => handleRestore(note.id, e)}
                  disabled={restoring === note.id}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-xs
                             text-green-600 hover:bg-green-500/10 transition-all"
                  title="Restore"
                >
                  {restoring === note.id ? '...' : '↩'}
                </button>
                <button
                  onClick={(e) => handlePermanentDelete(note.id, e)}
                  disabled={deleting === note.id}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-xs
                             text-red-600 hover:bg-red-500/10 transition-all"
                  title="Permanently delete"
                >
                  {deleting === note.id ? '...' : '×'}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const notes = useNoteStore((s) => s.notes);
  const loading = useNoteStore((s) => s.loading);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);
  const createNote = useNoteStore((s) => s.createNote);
  const activeNote = useNoteStore((s) => s.activeNote);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setShowGraph = useUIStore((s) => s.setShowGraph);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const authUser = useAuthStore((s) => s.user);
  const automationEvents = useAutomationEvents();

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [showNewNote, setShowNewNote] = useState(false);
  const [newNotePath, setNewNotePath] = useState('');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [tagFilterNotes, setTagFilterNotes] = useState<NoteMetadata[] | null>(
    null,
  );
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [collapseSignal, setCollapseSignal] = useState(0);

  // Build O(1) lookup Map for tree items
  const notesByPath = useMemo(() => {
    const map = new Map<string, NoteMetadata>();
    for (const n of notes) map.set(n.path, n);
    return map;
  }, [notes]);

  useEffect(() => {
    fetchNotes().then(() => {
      const match = window.location.pathname.match(/^\/notes\/(.+)$/);
      if (match) {
        openNoteByPath(decodeURIComponent(match[1]));
      }
    });
    getTree()
      .then(setTree)
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch tree whenever notes list changes (e.g. after create/delete/WS event)
  useEffect(() => {
    getTree()
      .then(setTree)
      .catch(() => {});
  }, [notes]);

  const handleNewNoteButtonClick = useCallback(() => {
    setShowNewNote(true);
  }, []);

  const handleNewNoteKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        let path = newNotePath.trim() || 'untitled';
        // Trailing slash means "create inside this directory".
        if (path.endsWith('/')) {
          path = `${path}untitled.md`;
        } else if (!path.endsWith('.md')) {
          path = `${path}.md`;
        }
        const title = path.split('/').pop()?.replace(/\.md$/, '') || 'untitled';
        createNote(title, path);
        setShowNewNote(false);
        setNewNotePath('');
      } else if (e.key === 'Escape') {
        setShowNewNote(false);
        setNewNotePath('');
      }
    },
    [newNotePath, createNote],
  );

  const handleNewNoteBlur = useCallback(() => {
    if (!newNotePath.trim()) {
      setShowNewNote(false);
      setNewNotePath('');
    }
  }, [newNotePath]);

  const handleTagFilter = useCallback(
    (filteredNotes: NoteMetadata[] | null, tag: string | null) => {
      setTagFilterNotes(filteredNotes);
      setActiveTag(tag);
    },
    [],
  );

  if (!sidebarOpen) {
    const noteInitial = activeNote?.title?.charAt(0)?.toUpperCase() || 'T';
    return (
      <button
        onClick={toggleSidebar}
        className="fixed top-3 left-3 z-10 p-2 rounded-lg
                   bg-sidebar dark:bg-sidebar-dark
                   border border-border dark:border-border-dark
                   hover:bg-border dark:hover:bg-border-dark transition-colors
                   flex items-center gap-1.5"
        title={`Open sidebar · ${activeNote?.title || 'No note'}`}
      >
        <span className="w-6 h-6 rounded bg-accent/10 flex items-center justify-center text-xs font-semibold text-accent">
          {noteInitial}
        </span>
        <VscChevronRight
          size={14}
          className="text-text-muted dark:text-text-muted-dark"
        />
      </button>
    );
  }

  return (
    <>
      <aside
        className="w-64 h-full flex flex-col
                   bg-sidebar dark:bg-sidebar-dark
                   border-r border-border dark:border-border-dark"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border-dark">
          <span className="text-sm font-semibold text-text dark:text-text-dark tracking-wide">
            Thynk
            <span className="ml-1.5 text-xs font-normal text-text-muted dark:text-text-muted-dark">
              {notes.length}
            </span>
          </span>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <NotificationsBell />
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

        {/* Action buttons */}
        <div className="px-3 py-2 space-y-0.5">
          <button
            onClick={handleNewNoteButtonClick}
            disabled={loading}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md
                       text-text-muted dark:text-text-muted-dark
                       hover:bg-border dark:hover:bg-border-dark transition-colors
                       disabled:opacity-50"
          >
            <VscNewFile size={16} />
            New Note
          </button>
          <button
            onClick={() => setShowGraph(true)}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md
                       text-text-muted dark:text-text-muted-dark
                       hover:bg-border dark:hover:bg-border-dark transition-colors"
          >
            <VscTypeHierarchySub size={16} />
            Graph
          </button>
          <button
            onClick={() => setShowTemplateSelector(true)}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md
                       text-text-muted dark:text-text-muted-dark
                       hover:bg-border dark:hover:bg-border-dark transition-colors"
          >
            <VscLayoutMenubar size={16} />
            New from Template
          </button>
          <button
            onClick={() => {
              window.history.pushState({}, '', '/calendar');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md
                       text-text-muted dark:text-text-muted-dark
                       hover:bg-border dark:hover:bg-border-dark transition-colors"
          >
            <VscCalendar size={16} />
            Calendar
          </button>
        </div>

        {/* Daily note calendar toggle */}
        <div className="px-3 pb-1">
          <button
            onClick={() => setShowCalendar((c) => !c)}
            className="text-xs text-text-muted dark:text-text-muted-dark underline hover:text-text dark:hover:text-text-dark transition-colors"
          >
            {showCalendar ? 'Hide calendar' : 'Show calendar'}
          </button>
        </div>
        {showCalendar && <DailyNoteCalendar />}

        {/* Inline new note input */}
        {showNewNote && (
          <div className="px-3 py-1">
            <input
              autoFocus
              type="text"
              value={newNotePath}
              onChange={(e) => setNewNotePath(e.target.value)}
              onKeyDown={handleNewNoteKeyDown}
              onBlur={handleNewNoteBlur}
              placeholder="filename or path/to/note"
              className="w-full px-2 py-1 text-sm rounded-md border border-accent
                         bg-surface dark:bg-surface-dark
                         text-text dark:text-text-dark
                         focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-xs text-text-muted dark:text-text-muted-dark mt-1">
              Enter path (e.g. projects/my-note) or leave blank for untitled.
              Press Enter to create, Esc to cancel.
            </p>
          </div>
        )}

        {/* Scrollable content */}
        <nav className="flex-1 overflow-y-auto pb-3">
          {/* Favorites */}
          <FavoritesSection />

          {/* Recent Notes */}
          <RecentNotesSection />

          {/* Trash */}
          <TrashSection />

          {/* Separator */}
          <hr className="mx-3 border-border dark:border-border-dark opacity-60" />

          {/* Automation log */}
          <AutomationLog events={automationEvents} />

          {/* Activity Feed */}
          <ActivityFeed />

          {/* Tag Browser */}
          <TagBrowser onTagFilter={handleTagFilter} />

          {/* Tag filtered notes or file tree */}
          {tagFilterNotes !== null && activeTag ? (
            <TagFilteredNotes notes={tagFilterNotes} tag={activeTag} />
          ) : (
            <div className="px-3">
              {tree.length > 0 && (
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-xs font-semibold text-text-muted dark:text-text-muted-dark uppercase tracking-wider">
                    Notes
                  </span>
                  <button
                    onClick={() => setCollapseSignal((c) => c + 1)}
                    className="text-[10px] text-text-muted dark:text-text-muted-dark hover:text-text dark:hover:text-text-dark transition-colors"
                    title="Collapse all folders"
                  >
                    Collapse all
                  </button>
                </div>
              )}
              {loading && notes.length === 0 && (
                <p className="text-xs text-text-muted dark:text-text-muted-dark px-3 py-4">
                  Loading…
                </p>
              )}
              {tree.length > 0 ? (
                <ul className="space-y-0.5">
                  {tree.map((node) => (
                    <TreeItem
                      key={node.name}
                      node={node}
                      path={node.name}
                      level={0}
                      collapseSignal={collapseSignal}
                      notesByPath={notesByPath}
                    />
                  ))}
                </ul>
              ) : (
                notes.length === 0 &&
                !loading && (
                  <p className="text-xs text-text-muted dark:text-text-muted-dark px-3 py-4">
                    No notes yet.{' '}
                    <button
                      onClick={handleNewNoteButtonClick}
                      className="underline hover:text-text dark:hover:text-text-dark"
                    >
                      Create one
                    </button>{' '}
                    to get started.
                  </p>
                )
              )}
            </div>
          )}

          {/* Backlinks - shown when a note is active */}
          {activeNote && <BacklinksPanel noteId={activeNote.id} />}
        </nav>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border dark:border-border-dark space-y-1.5">
          {/* Keyboard shortcuts */}
          <div className="flex items-center gap-2">
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
                Ctrl+B
              </kbd>{' '}
              Sidebar
            </p>
          </div>
          {/* User info + settings + logout */}
          {authUser && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
                  {(authUser.display_name ?? authUser.username)
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <span className="text-xs text-text-muted dark:text-text-muted-dark truncate">
                  {authUser.display_name ?? authUser.username}
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setSettingsOpen(true)}
                  title="Settings"
                  className="p-1 rounded text-text-muted dark:text-text-muted-dark
                             hover:bg-border dark:hover:bg-border-dark
                             hover:text-text dark:hover:text-text-dark
                             transition-colors"
                >
                  <VscSettingsGear size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Template selector modal */}
      {showTemplateSelector && (
        <TemplateSelector onClose={() => setShowTemplateSelector(false)} />
      )}
    </>
  );
}
