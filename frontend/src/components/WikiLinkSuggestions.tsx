import { useEffect, useState, useCallback } from 'react';
import { useNoteStore } from '../stores/noteStore';

interface Props {
  query: string;
  onSelect: (title: string) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

/**
 * Floating dropdown for wiki-link autocomplete.
 * Rendered at the position of the [[  trigger inside the editor.
 */
export function WikiLinkSuggestions({
  query,
  onSelect,
  onClose,
  anchorRect,
}: Props) {
  const notes = useNoteStore((s) => s.notes);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = notes
    .filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10);

  // Keep selection in bounds; safe to compute during render since it's a clamp
  const safeIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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
          if (filtered[safeIndex]) {
            onSelect(filtered[safeIndex].title);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    },
    [filtered, safeIndex, onSelect, onClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  if (filtered.length === 0) return null;

  // Position the dropdown below the anchor
  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.bottom + 4,
    left: anchorRect.left,
    zIndex: 9999,
  };

  return (
    <div
      style={style}
      className="bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                 rounded-lg shadow-lg overflow-hidden min-w-[200px] max-w-[320px]"
    >
      <ul ref={listRef} role="listbox" aria-label="Note suggestions">
        {filtered.map((note, i) => (
          <li
            key={note.id}
            role="option"
            aria-selected={i === safeIndex}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => onSelect(note.title)}
            className={`px-3 py-2 text-sm cursor-pointer select-none
              ${
                i === safeIndex
                  ? 'bg-accent/10 text-accent'
                  : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
              }`}
          >
            {note.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
