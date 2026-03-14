import { useState, useEffect, useRef, useCallback } from 'react';
import { VscSearch, VscLoading } from 'react-icons/vsc';
import type { NoteMetadata, SearchResult } from '../types';
import * as api from '../api';

interface Props {
  notes: NoteMetadata[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * Inner component for the command palette. Mounts fresh each time the palette
 * opens, so initial state is always reset without needing effects.
 */
export function CommandPaletteInner({ notes, onSelect, onClose }: Props) {
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

  // Items to display: search results when querying, all notes otherwise
  const items: Array<{ id: string; title: string; subtitle: string }> =
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
        }));

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, searchResults.length]);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (items[selectedIndex]) {
            onSelect(items[selectedIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [items, selectedIndex, onSelect, onClose],
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
        <ul className="max-h-64 overflow-y-auto py-2">
          {items.length === 0 && !searching && (
            <li className="px-4 py-3 text-sm text-text-muted dark:text-text-muted-dark">
              {query ? 'No matching notes found.' : 'No notes available.'}
            </li>
          )}
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                onClick={() => onSelect(item.id)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors
                  ${
                    i === selectedIndex
                      ? 'bg-accent/10 text-accent'
                      : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                  }`}
              >
                <span className="block truncate font-medium">{item.title}</span>
                {item.subtitle && (
                  <span className="block text-xs text-text-muted dark:text-text-muted-dark truncate mt-0.5">
                    {item.subtitle}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

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
