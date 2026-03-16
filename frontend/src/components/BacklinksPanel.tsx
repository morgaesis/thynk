import { useEffect, useState, useCallback } from 'react';
import {
  VscLink,
  VscLinkExternal,
  VscChevronDown,
  VscChevronRight,
} from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';
import { getBacklinks, getUnlinkedMentions, type UnlinkedMention } from '../api';
import type { NoteMetadata } from '../types';

interface Props {
  noteId: string;
}

/**
 * BacklinksPanel – displays:
 * 1. Notes that contain an explicit [[WikiLink]] pointing to the current note.
 * 2. "Unlinked mentions" – notes that mention the current note's title but aren't linked.
 */
export function BacklinksPanel({ noteId }: Props) {
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);
  const [backlinks, setBacklinks] = useState<NoteMetadata[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedMention[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [unlinkedExpanded, setUnlinkedExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!noteId) return;
    setLoading(true);
    try {
      const [bls, mentions] = await Promise.all([
        getBacklinks(noteId),
        getUnlinkedMentions(noteId),
      ]);
      setBacklinks(bls);
      setUnlinked(mentions);
    } catch {
      // Silently ignore – non-critical panel
    } finally {
      setLoading(false);
    }
  }, [noteId]);

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
              {unlinked.map((mention) => (
                <li key={mention.id}>
                  <button
                    onClick={() => void openNoteByPath(mention.path)}
                    className="flex flex-col w-full px-3 py-1.5 text-sm rounded-md
                               text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark
                               transition-colors text-left"
                  >
                    <span className="flex items-center gap-2">
                      <VscLinkExternal
                        size={13}
                        className="shrink-0 text-text-muted dark:text-text-muted-dark"
                      />
                      <span className="truncate">{mention.title}</span>
                    </span>
                    {mention.context && (
                      <span className="text-xs text-text-muted dark:text-text-muted-dark truncate ml-5">
                        {mention.context}
                      </span>
                    )}
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
