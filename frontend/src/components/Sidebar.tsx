import { useEffect, useCallback, useState } from 'react';
import {
  VscNewFile,
  VscFile,
  VscChevronRight,
  VscChevronLeft,
  VscTrash,
  VscFolder,
  VscChevronDown,
} from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';
import { useUIStore } from '../stores/uiStore';
import { ThemeToggle } from './ThemeToggle';
import type { TreeNode } from '../types';
import { getTree } from '../api';

function TreeItem({ node, path, level = 0 }: { node: TreeNode; path: string; level?: number }) {
  const [expanded, setExpanded] = useState(true);
  const isDir = node.children !== undefined;
  const notes = useNoteStore((s) => s.notes);
  const activeNote = useNoteStore((s) => s.activeNote);
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const [hoveredPath, setHoveredPath] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
          {expanded ? <VscChevronDown size={12} /> : <VscChevronRight size={12} />}
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
          ${isActive
            ? 'bg-accent/10 text-accent dark:text-accent'
            : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
          }`}
        style={{ paddingLeft: `${12 + level * 12}px`, paddingRight: '32px' }}
      >
        <VscFile size={14} className="shrink-0" />
        <span className="truncate flex-1 min-w-0">{node.name.replace(/\.md$/, '')}</span>
      </button>
      {(hoveredPath || confirmDelete) && noteMeta && (
        <button
          onClick={handleDeleteClick}
          className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded transition-colors
            ${confirmDelete
              ? 'bg-red-500/20 text-red-500'
              : 'text-text-muted dark:text-text-muted-dark hover:bg-red-500/10 hover:text-red-500'
            }`}
          title={confirmDelete ? 'Click again to confirm delete' : 'Delete note'}
        >
          <VscTrash size={13} />
        </button>
      )}
    </li>
  );
}

export function Sidebar() {
  const notes = useNoteStore((s) => s.notes);
  const loading = useNoteStore((s) => s.loading);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);
  const createNote = useNoteStore((s) => s.createNote);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [showNewNote, setShowNewNote] = useState(false);
  const [newNotePath, setNewNotePath] = useState('');

  useEffect(() => {
    fetchNotes().then(() => {
      const match = window.location.pathname.match(/^\/notes\/(.+)$/);
      if (match) {
        openNoteByPath(decodeURIComponent(match[1]));
      }
    });
    getTree().then(setTree).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch tree whenever notes list changes (e.g. after create/delete/WS event)
  useEffect(() => {
    getTree().then(setTree).catch(() => {});
  }, [notes]);

  const handleNewNoteButtonClick = useCallback(() => {
    setShowNewNote(true);
  }, []);

  const handleNewNoteKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const path = newNotePath.trim() || 'untitled';
        if (path.includes('/')) {
          createNote(
            path.split('/').pop()?.replace(/\.md$/, '') || 'Untitled',
            path.endsWith('.md') ? path : `${path}.md`,
          );
        } else {
          createNote(path.replace(/\.md$/, ''), `${path.replace(/\.md$/, '')}.md`);
        }
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
      </div>

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
            Enter path (e.g. projects/my-note) or leave blank for untitled. Press Enter to create,
            Esc to cancel.
          </p>
        </div>
      )}

      {/* Tree / Note list */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {loading && notes.length === 0 && (
          <p className="text-xs text-text-muted dark:text-text-muted-dark px-3 py-4">
            Loading…
          </p>
        )}
        {tree.length > 0 ? (
          <ul className="space-y-0.5">
            {tree.map((node) => (
              <TreeItem key={node.name} node={node} path={node.name} level={0} />
            ))}
          </ul>
        ) : (
          notes.length === 0 && !loading && (
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
      </nav>

      {/* Footer with keyboard shortcut hint */}
      <div className="px-4 py-2 border-t border-border dark:border-border-dark flex items-center gap-2">
        <p className="text-xs text-text-muted dark:text-text-muted-dark">
          <kbd className="px-1 py-0.5 rounded bg-border dark:bg-border-dark text-[10px]">
            Ctrl+K
          </kbd>{' '}
          Search
        </p>
        <span className="text-text-muted dark:text-text-muted-dark text-xs">·</span>
        <p className="text-xs text-text-muted dark:text-text-muted-dark">
          <kbd className="px-1 py-0.5 rounded bg-border dark:bg-border-dark text-[10px]">
            Ctrl+Shift+N
          </kbd>{' '}
          New
        </p>
      </div>
    </aside>
  );
}
