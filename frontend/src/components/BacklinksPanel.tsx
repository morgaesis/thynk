import { useEffect, useState, useCallback } from 'react';
import {
  VscLink,
  VscLinkExternal,
  VscChevronDown,
  VscChevronRight,
} from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';
import { getBacklinks, searchNotes } from '../api';
import type { NoteMetadata, SearchResult } from '../types';

interface Props {
  noteId: string;
  noteTitle: string;
}

/**
 * BacklinksPanel – displays:
 * 1. Notes that contain an explicit [[WikiLink]] pointing to the current note.
 * 2. "Unlinked mentions" – search results containing the note title as plain text.
 */
export function BacklinksPanel({ noteId, noteTitle }: Props) {
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);
  const [backlinks, setBacklinks] = useState<NoteMetadata[]>([]);
  const [unlinked, setUnlinked] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [unlinkedExpanded, setUnlinkedExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!noteId) return;
    setLoading(true);
    try {
      const [bls, searchResults] = await Promise.all([
        getBacklinks(noteId),
        searchNotes(noteTitle),
      ]);
      setBacklinks(bls);
      // Filter out the current note and notes already covered by backlinks
      const backlinkIds = new Set(bls.map((n) => n.id));
      setUnlinked(
        searchResults.filter(
          (r) => r.note_id !== noteId && !backlinkIds.has(r.note_id),
        ),
      );
    } catch {
      // Silently ignore – non-critical panel
    } finally {
      setLoading(false);
    }
  }, [noteId, noteTitle]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && backlinks.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-text-muted dark:text-text-muted-dark">
        Loading links…
      </div>
    );
  }

  return (
    <div className="border-t border-border dark:border-border-dark bg-sidebar dark:bg-sidebar-dark">
      {/* Backlinks section */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold
                   text-text-muted dark:text-text-muted-dark hover:text-text dark:hover:text-text-dark
                   transition-colors"
      >
        {expanded ? (
          <VscChevronDown size={12} />
        ) : (
          <VscChevronRight size={12} />
        )}
        <VscLink size={12} />
        <span>Backlinks</span>
        <span className="ml-auto font-normal">
          {backlinks.length > 0 ? backlinks.length : 'none'}
        </span>
      </button>

      {expanded && (
        <ul className="px-3 pb-2 space-y-0.5">
          {backlinks.length === 0 ? (
            <li className="px-3 py-1 text-xs text-text-muted dark:text-text-muted-dark">
              No notes link here yet.
            </li>
          ) : (
            backlinks.map((note) => (
              <li key={note.id}>
                <button
                  onClick={() => void openNoteByPath(note.path)}
                  className="flex items-center gap-2 w-full px-3 py-1 text-sm rounded-md
                             text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark
                             transition-colors text-left"
                >
                  <VscLink size={13} className="shrink-0 text-accent" />
                  <span className="truncate">{note.title}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {/* Unlinked mentions section */}
      {unlinked.length > 0 && (
        <>
          <button
            onClick={() => setUnlinkedExpanded(!unlinkedExpanded)}
            className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold
                       text-text-muted dark:text-text-muted-dark hover:text-text dark:hover:text-text-dark
                       transition-colors"
          >
            {unlinkedExpanded ? (
              <VscChevronDown size={12} />
            ) : (
              <VscChevronRight size={12} />
            )}
            <VscLinkExternal size={12} />
            <span>Unlinked mentions</span>
            <span className="ml-auto font-normal">{unlinked.length}</span>
          </button>

          {unlinkedExpanded && (
            <ul className="px-3 pb-2 space-y-0.5">
              {unlinked.map((result) => (
                <li key={result.note_id}>
                  <button
                    onClick={() => void openNoteByPath(result.path)}
                    className="flex items-center gap-2 w-full px-3 py-1 text-sm rounded-md
                               text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark
                               transition-colors text-left"
                  >
                    <VscLinkExternal
                      size={13}
                      className="shrink-0 text-text-muted dark:text-text-muted-dark"
                    />
                    <span className="truncate">{result.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
