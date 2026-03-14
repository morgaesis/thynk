import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { VscSearch } from 'react-icons/vsc';
import type { NoteMetadata } from '../types';

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
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query) return notes;
    const lower = query.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(lower));
  }, [notes, query]);

  // Focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setSelectedIndex(0);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[selectedIndex]) {
            onSelect(filtered[selectedIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, selectedIndex, onSelect, onClose],
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
          <VscSearch
            size={18}
            className="text-text-muted dark:text-text-muted-dark shrink-0"
          />
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
        </div>

        {/* Results */}
        <ul className="max-h-64 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-text-muted dark:text-text-muted-dark">
              {query ? 'No matching notes found.' : 'No notes available.'}
            </li>
          )}
          {filtered.map((note, i) => (
            <li key={note.id}>
              <button
                onClick={() => onSelect(note.id)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors
                  ${
                    i === selectedIndex
                      ? 'bg-accent/10 text-accent'
                      : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                  }`}
              >
                <span className="block truncate">{note.title}</span>
                <span className="block text-xs text-text-muted dark:text-text-muted-dark truncate">
                  {note.path}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
