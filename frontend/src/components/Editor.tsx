import { useEffect, useRef, useCallback } from 'react';
import {
  useEditor,
  EditorContent,
  type Editor as TipTapEditor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNoteStore } from '../stores/noteStore';

interface Props {
  onRegisterSave?: (saveFn: () => void) => void;
}

export function Editor({ onRegisterSave }: Props) {
  const activeNote = useNoteStore((s) => s.activeNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const saving = useNoteStore((s) => s.saving);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const activeNoteRef = useRef(activeNote);
  const editorRef = useRef<TipTapEditor | null>(null);

  useEffect(() => {
    activeNoteRef.current = activeNote;
  }, [activeNote]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing…',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose dark:prose-invert max-w-none focus:outline-none min-h-[300px]',
      },
    },
    onUpdate: ({ editor: e }) => {
      const note = activeNoteRef.current;
      if (!note) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateNote(note.id, { content: e.getHTML() });
      }, 1000);
    },
    onBlur: ({ editor: e }) => {
      const note = activeNoteRef.current;
      if (!note) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      updateNote(note.id, { content: e.getHTML() });
    },
  });

  // Keep editorRef in sync
  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  // Sync editor content when active note changes
  useEffect(() => {
    if (editor && activeNote) {
      editor.commands.setContent(activeNote.content || '');
    }
  }, [editor, activeNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const forceSave = useCallback(() => {
    const note = activeNoteRef.current;
    const ed = editorRef.current;
    if (!note || !ed) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updateNote(note.id, { content: ed.getHTML() });
    if (titleRef.current) {
      const newTitle = titleRef.current.value.trim();
      if (newTitle && newTitle !== note.title) {
        updateNote(note.id, { title: newTitle });
      }
    }
  }, [updateNote]);

  // Register save function with parent so Ctrl+S can trigger it
  useEffect(() => {
    if (onRegisterSave) {
      onRegisterSave(forceSave);
    }
  }, [onRegisterSave, forceSave]);

  const handleTitleBlur = useCallback(() => {
    const note = activeNoteRef.current;
    if (!note || !titleRef.current) return;
    const newTitle = titleRef.current.value.trim();
    if (newTitle && newTitle !== note.title) {
      updateNote(note.id, { title: newTitle });
    }
  }, [updateNote]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        editor?.commands.focus();
      }
    },
    [editor],
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!activeNote) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface dark:bg-surface-dark">
        <div className="text-center">
          <p className="text-lg text-text-muted dark:text-text-muted-dark">
            Select a note or create a new one
          </p>
          <p className="text-sm text-text-muted dark:text-text-muted-dark mt-2">
            Press{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-border dark:bg-border-dark text-xs">
              Ctrl+N
            </kbd>{' '}
            to create a note or{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-border dark:bg-border-dark text-xs">
              Ctrl+K
            </kbd>{' '}
            to search
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-surface dark:bg-surface-dark">
      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* Title */}
        <input
          ref={titleRef}
          key={activeNote.id}
          defaultValue={activeNote.title}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          className="w-full text-3xl font-bold bg-transparent border-none outline-none
                     text-text dark:text-text-dark placeholder:text-text-muted
                     dark:placeholder:text-text-muted-dark mb-6"
          placeholder="Untitled"
        />

        {/* Status bar */}
        <div className="flex items-center gap-3 mb-4 text-xs text-text-muted dark:text-text-muted-dark">
          {saving ? <span>Saving…</span> : <span>Saved</span>}
          <span>·</span>
          <span className="tabular-nums">
            {new Date(activeNote.updated_at).toLocaleString()}
          </span>
        </div>

        {/* Editor */}
        <EditorContent
          editor={editor}
          className="text-text dark:text-text-dark"
        />
      </div>
    </div>
  );
}
