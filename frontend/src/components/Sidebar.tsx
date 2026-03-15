import { useEffect, useCallback, useState } from 'react';
import {
  VscNewFile,
  VscFile,
  VscChevronRight,
  VscChevronLeft,
  VscTrash,
  VscFolder,
  VscChevronDown,
  VscSignOut,
  VscStarEmpty,
  VscStarFull,
  VscLayoutMenubar,
  VscSettingsGear,
  VscTypeHierarchySub,
  VscCloudDownload,
  VscCloudUpload,
  VscCalendar,
} from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { ThemeToggle } from './ThemeToggle';
import { TagBrowser, TagFilteredNotes } from './TagBrowser';
import { DailyNoteButton } from './DailyNoteButton';
import { DailyNoteCalendar } from './DailyNoteCalendar';
import { TemplateSelector } from './TemplateSelector';
import { AutomationLog } from './AutomationLog';
import { useAutomationEvents } from '../hooks/useAutomationEvents';
import { ImportModal } from './ImportModal';
import { CalendarView } from './CalendarView';
import type { TreeNode, NoteMetadata } from '../types';
import { getTree, toggleFavorite, getFavorites, exportWorkspace } from '../api';

function TreeItem({
  node,
  path,
  level = 0,
}: {
  node: TreeNode;
  path: string;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const isDir = node.children !== undefined;
  const notes = useNoteStore((s) => s.notes);
  const activeNote = useNoteStore((s) => s.activeNote);
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const addToast = useUIStore((s) => s.addToast);
  const [hoveredPath, setHoveredPath] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [favoriting, setFavoriting] = useState(false);

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
        </button>
        {expanded && (
          <ul>
            {node.children!.map((child) => (
              <TreeItem
                key={child.name}
                node={child}
                path={path ? `${path}/${child.name}` : child.name}
                level={level + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  // File node
  const noteMeta = notes.find((n) => n.path === path);
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
      className="group relative"
      onMouseEnter={() => setHoveredPath(true)}
      onMouseLeave={() => setHoveredPath(false)}
    >
      <button
        onClick={() => noteMeta && openNoteByPath(path)}
        className={`flex items-center gap-2 w-full py-1.5 text-sm rounded-md
          transition-colors text-left
          ${
            isActive
              ? 'bg-accent/10 text-accent dark:text-accent'
              : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
          }`}
        style={{ paddingLeft: `${12 + level * 12}px`, paddingRight: '56px' }}
      >
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
                onClick={() => openNote(n.id)}
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
          {recentNotes.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => openNote(n.id)}
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
              </button>
            </li>
          ))}
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
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const automationEvents = useAutomationEvents();

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [showNewNote, setShowNewNote] = useState(false);
  const [newNotePath, setNewNotePath] = useState('');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  // Tag filter state: when a tag is selected, replace the file tree with filtered notes.
  const [tagFilterNotes, setTagFilterNotes] = useState<NoteMetadata[] | null>(
    null,
  );
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportWorkspace();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, []);

  const handleImported = useCallback(() => {
    fetchNotes();
    getTree()
      .then(setTree)
      .catch(() => {});
  }, [fetchNotes]);

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
            onClick={() => {
              window.history.pushState({}, '', '/graph');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
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
          <DailyNoteButton />
          <button
            onClick={() => setShowFullCalendar(true)}
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

          {/* Automation log */}
          <AutomationLog events={automationEvents} />

          {/* Tag Browser */}
          <TagBrowser onTagFilter={handleTagFilter} />

          {/* Tag filtered notes or file tree */}
          {tagFilterNotes !== null && activeTag ? (
            <TagFilteredNotes notes={tagFilterNotes} tag={activeTag} />
          ) : (
            <div className="px-3">
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
                Ctrl+Shift+N
              </kbd>{' '}
              New
            </p>
          </div>
          {/* Import / Export actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowImport(true)}
              title="Import notes"
              className="flex items-center gap-1.5 px-2 py-1 text-xs rounded
                         text-text-muted dark:text-text-muted-dark
                         hover:bg-border dark:hover:bg-border-dark
                         hover:text-text dark:hover:text-text-dark
                         transition-colors"
            >
              <VscCloudUpload size={13} />
              Import
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              title="Export all notes as zip"
              className="flex items-center gap-1.5 px-2 py-1 text-xs rounded
                         text-text-muted dark:text-text-muted-dark
                         hover:bg-border dark:hover:bg-border-dark
                         hover:text-text dark:hover:text-text-dark
                         disabled:opacity-50 transition-colors"
            >
              <VscCloudDownload size={13} />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
          {/* User info + settings + logout */}
          {authUser && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted dark:text-text-muted-dark truncate max-w-[110px]">
                {authUser.display_name ?? authUser.username}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => {
                    window.history.pushState({}, '', '/settings');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  title="Settings"
                  className="p-1 rounded text-text-muted dark:text-text-muted-dark
                             hover:bg-border dark:hover:bg-border-dark
                             hover:text-text dark:hover:text-text-dark
                             transition-colors"
                >
                  <VscSettingsGear size={14} />
                </button>
                <button
                  onClick={() => logout()}
                  title="Sign out"
                  className="p-1 rounded text-text-muted dark:text-text-muted-dark
                             hover:bg-border dark:hover:bg-border-dark
                             hover:text-text dark:hover:text-text-dark
                             transition-colors"
                >
                  <VscSignOut size={14} />
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

      {/* Import modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}

      {/* Full CalendarView modal */}
      {showFullCalendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="w-[900px] max-w-[95vw] h-[600px] max-h-[90vh] rounded-xl shadow-xl
                        overflow-hidden border border-border dark:border-border-dark"
          >
            <CalendarView onClose={() => setShowFullCalendar(false)} />
          </div>
        </div>
      )}
    </>
  );
}
