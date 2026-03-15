import { useEffect, useState } from 'react';
import { VscFile, VscClose } from 'react-icons/vsc';
import { listTemplates, createFromTemplate } from '../api';
import { useNoteStore } from '../stores/noteStore';
import { useUIStore } from '../stores/uiStore';
import type { NoteMetadata } from '../types';

interface TemplateSelectorProps {
  onClose: () => void;
}

export function TemplateSelector({ onClose }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<NoteMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<NoteMetadata | null>(
    null,
  );
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const openNote = useNoteStore((s) => s.openNote);
  const addToast = useUIStore((s) => s.addToast);

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!selectedTemplate || !newTitle.trim()) return;
    setCreating(true);
    try {
      const note = await createFromTemplate({
        template_id: selectedTemplate.id,
        title: newTitle.trim(),
      });
      await fetchNotes();
      await openNote(note.id);
      addToast('success', `Created "${newTitle.trim()}" from template`);
      onClose();
    } catch (e) {
      addToast(
        'error',
        `Failed to create from template: ${(e as Error).message}`,
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-96 max-h-[80vh] flex flex-col rounded-lg shadow-xl
                   bg-surface dark:bg-surface-dark
                   border border-border dark:border-border-dark"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border-dark">
          <h2 className="text-sm font-semibold text-text dark:text-text-dark">
            New from Template
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted dark:text-text-muted-dark
                       hover:bg-border dark:hover:bg-border-dark transition-colors"
          >
            <VscClose size={16} />
          </button>
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading && (
            <p className="text-xs text-text-muted dark:text-text-muted-dark">
              Loading templates…
            </p>
          )}
          {!loading && templates.length === 0 && (
            <div className="text-xs text-text-muted dark:text-text-muted-dark">
              <p>No templates found.</p>
              <p className="mt-1">
                Create notes in the{' '}
                <code className="px-1 py-0.5 rounded bg-border dark:bg-border-dark text-[11px]">
                  .templates/
                </code>{' '}
                directory to use them as templates.
              </p>
            </div>
          )}
          {!loading && templates.length > 0 && (
            <ul className="space-y-1">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedTemplate(t)}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md
                      transition-colors text-left
                      ${
                        selectedTemplate?.id === t.id
                          ? 'bg-accent/10 text-accent dark:text-accent border border-accent/30'
                          : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                      }`}
                  >
                    <VscFile size={14} className="shrink-0" />
                    <span className="truncate">{t.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Title input + Create button */}
        {selectedTemplate && (
          <div className="p-3 border-t border-border dark:border-border-dark space-y-2">
            <p className="text-xs text-text-muted dark:text-text-muted-dark">
              Using template:{' '}
              <span className="text-accent">{selectedTemplate.title}</span>
            </p>
            <input
              autoFocus
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="Note title"
              className="w-full px-2 py-1.5 text-sm rounded-md border border-border dark:border-border-dark
                         bg-surface dark:bg-surface-dark
                         text-text dark:text-text-dark
                         focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || creating}
              className="w-full px-3 py-1.5 text-sm rounded-md
                         bg-accent text-white font-medium
                         hover:bg-accent/90 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating…' : 'Create Note'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
