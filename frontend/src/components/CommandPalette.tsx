import { useEffect, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useNoteStore } from '../stores/noteStore';
import { CommandPaletteInner } from './CommandPaletteInner';

/**
 * Wrapper that mounts/unmounts the inner component to reset state on open.
 * This avoids setState-in-effect and ref-during-render lint issues.
 */
export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const notes = useNoteStore((s) => s.notes);
  const openNote = useNoteStore((s) => s.openNote);
  const createNote = useNoteStore((s) => s.createNote);

  const handleSelect = useCallback(
    (id: string) => {
      openNote(id);
      setOpen(false);
    },
    [openNote, setOpen],
  );

  const handleCreate = useCallback(
    (title: string) => {
      createNote(title);
      setOpen(false);
    },
    [createNote, setOpen],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  // Close on Escape at the window level
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <CommandPaletteInner
      notes={notes}
      onSelect={handleSelect}
      onCreate={handleCreate}
      onClose={handleClose}
    />
  );
}
