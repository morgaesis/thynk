import { useEffect, useState } from 'react';
import { VscTag } from 'react-icons/vsc';
import { listTags, getNotesByTag } from '../api';
import { useNoteStore } from '../stores/noteStore';
import type { TagEntry, NoteMetadata } from '../types';

interface TagBrowserProps {
  onTagFilter?: (notes: NoteMetadata[] | null, tag: string | null) => void;
}

export function TagBrowser({ onTagFilter }: TagBrowserProps) {
  const [tags, setTags] = useState<TagEntry[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const notes = useNoteStore((s) => s.notes);

  useEffect(() => {
    listTags()
      .then(setTags)
      .catch(() => {});
  }, [notes]); // refresh when notes change

  const handleTagClick = async (tag: string) => {
    if (activeTag === tag) {
      // Deselect
      setActiveTag(null);
      onTagFilter?.(null, null);
      return;
    }
    setActiveTag(tag);
    try {
      const tagNotes = await getNotesByTag(tag);
      onTagFilter?.(tagNotes, tag);
    } catch {
      onTagFilter?.(null, null);
    }
  };

  if (tags.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-semibold
                   text-text-muted dark:text-text-muted-dark uppercase tracking-wider
                   hover:text-text dark:hover:text-text-dark transition-colors"
      >
        <VscTag size={12} />
        Tags
        <span className="ml-auto text-[10px] normal-case font-normal">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button
              key={t.name}
              onClick={() => handleTagClick(t.name)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                transition-colors
                ${
                  activeTag === t.name
                    ? 'bg-accent text-white'
                    : 'bg-border dark:bg-border-dark text-text-muted dark:text-text-muted-dark hover:bg-accent/20 hover:text-accent'
                }`}
            >
              <span>#{t.name}</span>
              <span className="opacity-60">{t.count}</span>
            </button>
          ))}
          {activeTag && (
            <button
              onClick={() => {
                setActiveTag(null);
                onTagFilter?.(null, null);
              }}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs
                         bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
      {/* Filtered notes list */}
      {activeTag && onTagFilter === undefined && (
        <div className="px-3 pb-2 space-y-0.5">
          {/* When used standalone, show notes inline */}
        </div>
      )}
    </div>
  );
}

// Standalone filtered note list shown below tag browser
export function TagFilteredNotes({
  notes,
  tag,
}: {
  notes: NoteMetadata[];
  tag: string;
}) {
  const openNote = useNoteStore((s) => s.openNote);
  const activeNote = useNoteStore((s) => s.activeNote);

  return (
    <div className="px-3 pb-2">
      <p className="text-xs text-text-muted dark:text-text-muted-dark mb-1">
        Notes tagged <span className="text-accent">#{tag}</span> ({notes.length}
        )
      </p>
      <ul className="space-y-0.5">
        {notes.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => openNote(n.id)}
              className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md
                transition-colors text-left truncate
                ${
                  activeNote?.id === n.id
                    ? 'bg-accent/10 text-accent dark:text-accent'
                    : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                }`}
            >
              <VscTag size={12} className="shrink-0 text-accent" />
              <span className="truncate">{n.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
