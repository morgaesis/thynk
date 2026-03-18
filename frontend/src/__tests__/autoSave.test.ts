import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { saveBeforeUnload, handleVisibilityChange } from '../hooks/useAutoSave';
import { useNoteStore } from '../stores/noteStore';
import type { Note, NoteMetadata } from '../types';

vi.mock('../api', () => ({
  listNotes: vi.fn(),
  getNote: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  searchNotes: vi.fn(),
}));

vi.mock('../stores/uiStore', () => ({
  useUIStore: {
    getState: () => ({ addToast: vi.fn() }),
  },
}));

import * as api from '../api';

const makeMetadata = (overrides: Partial<NoteMetadata> = {}): NoteMetadata => ({
  id: 'note-1',
  path: 'notes/test.md',
  title: 'Test Note',
  content_hash: 'abc123',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  path: 'notes/test.md',
  title: 'Test Note',
  content: '# Test Note\n\nSome content.',
  content_hash: 'abc123',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  useNoteStore.setState({
    notes: [],
    activeNote: null,
    loading: false,
    saving: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe('auto-save functions', () => {
  let mockUpdateNote: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUpdateNote = vi.fn().mockResolvedValue(makeNote());
    (api.updateNote as ReturnType<typeof vi.fn>).mockImplementation(mockUpdateNote);
  });

  describe('saveBeforeUnload', () => {
    it('saves note content when there is an active note', async () => {
      const note = makeNote({ id: 'autosave-1', content: 'Original content' });
      useNoteStore.setState({
        notes: [makeMetadata({ id: 'autosave-1' })],
        activeNote: note,
      });

      await act(async () => {
        await saveBeforeUnload();
      });

      expect(mockUpdateNote).toHaveBeenCalledWith('autosave-1', { content: 'Original content' });
    });

    it('does not save if no active note', async () => {
      useNoteStore.setState({
        notes: [],
        activeNote: null,
      });

      await act(async () => {
        await saveBeforeUnload();
      });

      expect(mockUpdateNote).not.toHaveBeenCalled();
    });
  });

  describe('handleVisibilityChange', () => {
    it('returns content when tab becomes hidden with active note', () => {
      const note = makeNote({ id: 'autosave-2', content: 'Content to save' });
      useNoteStore.setState({
        notes: [makeMetadata({ id: 'autosave-2' })],
        activeNote: note,
      });

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
      });

      const content = handleVisibilityChange();

      expect(content).toBe('Content to save');
    });

    it('returns undefined when tab is visible', () => {
      const note = makeNote({ id: 'autosave-3', content: 'Should not save' });
      useNoteStore.setState({
        notes: [makeMetadata({ id: 'autosave-3' })],
        activeNote: note,
      });

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
      });

      const content = handleVisibilityChange();

      expect(content).toBeUndefined();
    });

    it('returns undefined when no active note', () => {
      useNoteStore.setState({
        notes: [],
        activeNote: null,
      });

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
      });

      const content = handleVisibilityChange();

      expect(content).toBeUndefined();
    });
  });
});
