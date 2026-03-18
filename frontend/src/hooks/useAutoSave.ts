import { useEffect, useCallback, useRef } from 'react';
import type { Editor as TipTapEditor } from '@tiptap/react';
import { useNoteStore } from '../stores/noteStore';

export function useAutoSave(editor: TipTapEditor | null) {
  const activeNote = useNoteStore((s) => s.activeNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const pendingContentRef = useRef<string | null>(null);

  const saveNow = useCallback(async () => {
    if (!activeNote || !editor) return;
    const content = pendingContentRef.current ?? editor.getHTML();
    if (content) {
      await updateNote(activeNote.id, { content });
    }
  }, [activeNote, editor, updateNote]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!activeNote || !editor) return;
      const content = editor.getHTML();
      if (content && activeNote.content !== content) {
        navigator.sendBeacon?.(
          `/api/notes/${activeNote.id}`,
          JSON.stringify({ content }),
        );
        pendingContentRef.current = content;
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden' && activeNote && editor) {
        const content = editor.getHTML();
        if (content && activeNote.content !== content) {
          await updateNote(activeNote.id, { content });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeNote, editor, updateNote]);

  return { saveNow };
}

export async function saveBeforeUnload() {
  const activeNote = useNoteStore.getState().activeNote;
  if (!activeNote) return;
  await useNoteStore
    .getState()
    .updateNote(activeNote.id, { content: activeNote.content });
}

export function handleVisibilityChange() {
  const activeNote = useNoteStore.getState().activeNote;
  if (!activeNote || document.visibilityState !== 'hidden') return;
  return activeNote.content;
}
