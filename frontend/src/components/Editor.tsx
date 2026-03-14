import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNoteStore } from '../stores/noteStore';

export function Editor() {
  const activeNote = useNoteStore((s) => s.activeNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const saving = useNoteStore((s) => s.saving);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose dark:prose-invert max-w-none focus:outline-none min-h-[300px]',
      },
    },
    onUpdate: ({ editor }) => {
      if (!activeNote) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateNote(activeNote.id, { content: editor.getHTML() });
      }, 1000);
    },
    onBlur: ({ editor }) => {
      if (!activeNote) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      updateNote(activeNote.id, { content: editor.getHTML() });
    },
  });

  // Sync editor content when active note changes
  useEffect(() => {
    if (editor && activeNote) {
      editor.commands.setContent(activeNote.content || '');
    }
  }, [editor, activeNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTitleBlur = useCallback(() => {
    if (!activeNote || !titleRef.current) return;
    const newTitle = titleRef.current.value.trim();
    if (newTitle && newTitle !== activeNote.title) {
      updateNote(activeNote.id, { title: newTitle });
    }
  }, [activeNote, updateNote]);

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

        {/* Saving indicator */}
        {saving && (
          <p className="text-xs text-text-muted dark:text-text-muted-dark mb-4">
            Saving...
          </p>
        )}

        {/* Editor */}
        <EditorContent
          editor={editor}
          className="text-text dark:text-text-dark"
        />
      </div>
    </div>
  );
}
