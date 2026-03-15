import { useCallback } from 'react';
import { VscCalendar } from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';
import { useUIStore } from '../stores/uiStore';

function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DailyNoteButton() {
  const notes = useNoteStore((s) => s.notes);
  const openNote = useNoteStore((s) => s.openNote);
  const createNote = useNoteStore((s) => s.createNote);
  const loading = useNoteStore((s) => s.loading);
  const addToast = useUIStore((s) => s.addToast);

  const handleClick = useCallback(async () => {
    const dateStr = todayDateStr();
    const path = `daily/${dateStr}.md`;

    // Look for existing daily note.
    const existing = notes.find((n) => n.path === path);
    if (existing) {
      await openNote(existing.id);
    } else {
      try {
        await createNote(dateStr, path);
        addToast('success', `Opened daily note for ${dateStr}`);
      } catch {
        addToast('error', 'Failed to create daily note');
      }
    }
  }, [notes, openNote, createNote, addToast]);

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title="Open today's daily note"
      className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md
                 text-text-muted dark:text-text-muted-dark
                 hover:bg-border dark:hover:bg-border-dark transition-colors
                 disabled:opacity-50"
    >
      <VscCalendar size={16} />
      Today
    </button>
  );
}
