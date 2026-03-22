import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  VscSearch,
  VscLoading,
  VscSettingsGear,
  VscAdd,
} from 'react-icons/vsc';
import type { NoteMetadata, SearchResult } from '../types';
import { useUIStore } from '../stores/uiStore';
import * as api from '../api';

interface Props {
  notes: NoteMetadata[];
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
  onClose: () => void;
}

const SETTINGS_ITEMS = [
  {
    id: 'settings:theme',
    label: 'Settings: Color theme',
    subtitle: 'Change light/dark theme',
  },
  {
    id: 'settings:font-size',
    label: 'Settings: Font size',
    subtitle: 'Editor font size in pixels',
  },
  {
    id: 'settings:vim-mode',
    label: 'Settings: Vim mode',
    subtitle: 'Toggle vim keybindings',
  },
  {
    id: 'settings:spell-check',
    label: 'Settings: Spell check',
    subtitle: 'Toggle spell check',
  },
  {
    id: 'settings:line-height',
    label: 'Settings: Line height',
    subtitle: 'Editor line height',
  },
  {
    id: 'settings:export',
    label: 'Settings: Export workspace',
    subtitle: 'Export all notes as ZIP',
  },
  {
    id: 'settings:import',
    label: 'Settings: Import notes',
    subtitle: 'Import markdown or Obsidian vault',
  },
  {
    id: 'settings:account',
    label: 'Settings: Account',
    subtitle: 'Username, display name, storage',
  },
];

/**
 * Inner component for the command palette. Mounts fresh each time the palette
 * opens, so initial state is always reset without needing effects.
 */
export function CommandPaletteInner({
  notes,
  onSelect,
  onCreate,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Run API search when query changes (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.searchNotes(query.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Note items to display: search results when querying, all notes otherwise
  const noteItems = useMemo<
    Array<{ id: string; title: string; subtitle: string }>
  >(
    () =>
      query.trim()
        ? searchResults.map((r) => ({
            id: r.note_id,
            title: r.title,
            subtitle: r.snippet.replace(/<\/?mark>/g, ''),
          }))
        : notes.map((n) => ({
            id: n.id,
            title: n.title,
            subtitle: typeof n.path === 'string' ? n.path : String(n.path),
          })),
    [query, searchResults, notes],
  );

  // Settings items shown when there's a query that matches
  const filteredSettingsItems = useMemo(
    () =>
      query.trim()
        ? SETTINGS_ITEMS.filter((item) => {
            const q = query.toLowerCase();
            return (
              item.label.toLowerCase().includes(q) ||
              item.subtitle.toLowerCase().includes(q)
            );
          })
        : [],
    [query],
  );

  // Show create-note action when there's a query
  const showCreate = query.trim().length > 0;
  const createTitle = query.trim();

  const allItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      subtitle: string;
      isSettings: boolean;
      isCreate: boolean;
    }> = [];
    if (showCreate) {
      items.push({
        id: '__create__',
        title: `Create "${createTitle}"`,
        subtitle: 'Create a new note with this title',
        isSettings: false,
        isCreate: true,
      });
    }
    for (const item of noteItems) {
      items.push({ ...item, isSettings: false, isCreate: false });
    }
    for (const item of filteredSettingsItems) {
      items.push({
        id: item.id,
        title: item.label,
        subtitle: item.subtitle,
        isSettings: true,
        isCreate: false,
      });
    }
    return items;
  }, [showCreate, createTitle, noteItems, filteredSettingsItems]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, searchResults.length]);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
    },
    [],
  );

  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  const handleSelect = useCallback(
    (id: string, isSettings: boolean, isCreate: boolean) => {
      if (isCreate) {
        onCreate(createTitle);
      } else if (isSettings) {
        setSettingsOpen(true);
        onClose();
      } else {
        onSelect(id);
      }
    },
    [onSelect, onCreate, onClose, setSettingsOpen, createTitle],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (allItems[selectedIndex]) {
            handleSelect(
              allItems[selectedIndex].id,
              allItems[selectedIndex].isSettings,
              allItems[selectedIndex].isCreate,
            );
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [allItems, selectedIndex, handleSelect, onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-lg shadow-2xl overflow-hidden
                   bg-surface dark:bg-surface-dark
                   border border-border dark:border-border-dark"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border dark:border-border-dark">
          {searching ? (
            <VscLoading
              size={18}
              className="text-text-muted dark:text-text-muted-dark shrink-0 animate-spin"
            />
          ) : (
            <VscSearch
              size={18}
              className="text-text-muted dark:text-text-muted-dark shrink-0"
            />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            placeholder="Search notes..."
            className="flex-1 bg-transparent border-none outline-none text-sm
                       text-text dark:text-text-dark
                       placeholder:text-text-muted dark:placeholder:text-text-muted-dark"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-xs text-text-muted dark:text-text-muted-dark hover:text-text dark:hover:text-text-dark"
            >
              Clear
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto py-2">
          {allItems.length === 0 && !searching && (
            <div className="px-4 py-3 text-sm text-text-muted dark:text-text-muted-dark">
              No notes available.
            </div>
          )}
          {/* Create-note item */}
          {showCreate && noteItems.length === 0 && !searching && (
            <ul>
              <li>
                <button
                  onClick={() => handleSelect('__create__', false, true)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2
                    ${
                      selectedIndex === 0
                        ? 'bg-accent/10 text-accent'
                        : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                    }`}
                >
                  <VscAdd size={14} className="shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium">
                      Create &ldquo;{createTitle}&rdquo;
                    </span>
                    <span className="block text-xs text-text-muted dark:text-text-muted-dark truncate mt-0.5">
                      Create a new note
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          )}
          {/* Note items */}
          {noteItems.length > 0 && (
            <ul>
              {noteItems.map((item, i) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleSelect(item.id, false, false)}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors
                      ${
                        i === selectedIndex
                          ? 'bg-accent/10 text-accent'
                          : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                      }`}
                  >
                    <span className="block truncate font-medium">
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span className="block text-xs text-text-muted dark:text-text-muted-dark truncate mt-0.5">
                        {item.subtitle}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Settings items */}
          {filteredSettingsItems.length > 0 && (
            <>
              {noteItems.length > 0 && (
                <div className="px-4 py-1 mt-1 text-xs font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted-dark border-t border-border dark:border-border-dark">
                  Settings
                </div>
              )}
              {noteItems.length === 0 && (
                <div className="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted-dark">
                  Settings
                </div>
              )}
              <ul>
                {filteredSettingsItems.map((item, si) => {
                  const globalIndex = noteItems.length + si;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleSelect(item.id, true, false)}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2
                          ${
                            globalIndex === selectedIndex
                              ? 'bg-accent/10 text-accent'
                              : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                          }`}
                      >
                        <VscSettingsGear
                          size={13}
                          className="shrink-0 text-text-muted dark:text-text-muted-dark"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block truncate font-medium">
                            {item.label}
                          </span>
                          <span className="block text-xs text-text-muted dark:text-text-muted-dark truncate mt-0.5">
                            {item.subtitle}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border dark:border-border-dark flex items-center gap-3 text-xs text-text-muted dark:text-text-muted-dark">
          <span>
            <kbd className="px-1 py-0.5 rounded bg-border dark:bg-border-dark text-[10px]">
              ↑↓
            </kbd>{' '}
            navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-border dark:bg-border-dark text-[10px]">
              ↵
            </kbd>{' '}
            open
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-border dark:bg-border-dark text-[10px]">
              Esc
            </kbd>{' '}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
