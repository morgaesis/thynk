import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNoteStore } from '../stores/noteStore';
import type { Note, NoteMetadata } from '../types';

// Mock the API module
vi.mock('../api', () => ({
  listNotes: vi.fn(),
  getNote: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  searchNotes: vi.fn(),
}));

// Mock useUIStore to avoid toast errors
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
  // Reset store to initial state before each test
  useNoteStore.setState({
    notes: [],
    activeNote: null,
    loading: false,
    saving: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe('noteStore.fetchNotes', () => {
  it('populates the notes array on success', async () => {
    const mockNotes = [makeMetadata({ id: 'n1' }), makeMetadata({ id: 'n2', title: 'Another' })];
    (api.listNotes as ReturnType<typeof vi.fn>).mockResolvedValue(mockNotes);

    await useNoteStore.getState().fetchNotes();

    const { notes, loading, error } = useNoteStore.getState();
    expect(notes).toHaveLength(2);
    expect(notes[0].id).toBe('n1');
    expect(loading).toBe(false);
    expect(error).toBeNull();
  });

  it('sets error on failure', async () => {
    (api.listNotes as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network failure'));

    await useNoteStore.getState().fetchNotes();

    const { notes, loading, error } = useNoteStore.getState();
    expect(notes).toHaveLength(0);
    expect(loading).toBe(false);
    expect(error).toBe('Network failure');
  });
});

describe('noteStore.createNote', () => {
  it('adds a note and sets it as activeNote', async () => {
    const newNote = makeNote({ id: 'new-1', title: 'Brand New Note' });
    (api.createNote as ReturnType<typeof vi.fn>).mockResolvedValue(newNote);
    (api.listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([makeMetadata({ id: 'new-1', title: 'Brand New Note' })]);

    await useNoteStore.getState().createNote('Brand New Note');

    const { activeNote } = useNoteStore.getState();
    expect(activeNote).not.toBeNull();
    expect(activeNote?.id).toBe('new-1');
    expect(activeNote?.title).toBe('Brand New Note');
  });

  it('refreshes the note list after creation', async () => {
    const newNote = makeNote({ id: 'new-2' });
    const newMeta = makeMetadata({ id: 'new-2' });
    (api.createNote as ReturnType<typeof vi.fn>).mockResolvedValue(newNote);
    (api.listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([newMeta]);

    await useNoteStore.getState().createNote('New Note');

    expect(api.listNotes).toHaveBeenCalled();
    expect(useNoteStore.getState().notes).toHaveLength(1);
  });

  it('sets error on failure', async () => {
    (api.createNote as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Create failed'));

    await useNoteStore.getState().createNote('Fail Note');

    const { error, loading } = useNoteStore.getState();
    expect(error).toBe('Create failed');
    expect(loading).toBe(false);
  });
});

describe('noteStore.deleteNote', () => {
  it('removes note from list and clears activeNote if it was active', async () => {
    const note = makeNote({ id: 'del-1' });
    useNoteStore.setState({
      notes: [makeMetadata({ id: 'del-1' }), makeMetadata({ id: 'del-2' })],
      activeNote: note,
    });
    (api.deleteNote as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (api.listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([makeMetadata({ id: 'del-2' })]);

    await useNoteStore.getState().deleteNote('del-1');

    const { activeNote, notes } = useNoteStore.getState();
    expect(activeNote).toBeNull();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe('del-2');
  });

  it('does not clear activeNote if a different note is active', async () => {
    const otherNote = makeNote({ id: 'other-1' });
    useNoteStore.setState({
      notes: [makeMetadata({ id: 'del-3' }), makeMetadata({ id: 'other-1' })],
      activeNote: otherNote,
    });
    (api.deleteNote as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (api.listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([makeMetadata({ id: 'other-1' })]);

    await useNoteStore.getState().deleteNote('del-3');

    const { activeNote } = useNoteStore.getState();
    expect(activeNote?.id).toBe('other-1');
  });
});

describe('noteStore.openNote', () => {
  it('sets activeNote and updates the browser URL', async () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const note = makeNote({ id: 'open-1', path: 'projects/my note.md' });
    (api.getNote as ReturnType<typeof vi.fn>).mockResolvedValue(note);

    await useNoteStore.getState().openNote('open-1');

    const { activeNote } = useNoteStore.getState();
    expect(activeNote?.id).toBe('open-1');
    expect(pushStateSpy).toHaveBeenCalledWith(
      {},
      '',
      `/notes/${encodeURIComponent('projects/my note.md')}`,
    );

    pushStateSpy.mockRestore();
  });

  it('sets error on failure', async () => {
    (api.getNote as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));

    await useNoteStore.getState().openNote('bad-id');

    const { error, loading } = useNoteStore.getState();
    expect(error).toBe('Not found');
    expect(loading).toBe(false);
  });
});

describe('noteStore.openNoteByPath', () => {
  it('calls openNote with the correct id when path matches', async () => {
    const meta = makeMetadata({ id: 'path-1', path: 'docs/readme.md' });
    const note = makeNote({ id: 'path-1', path: 'docs/readme.md' });
    useNoteStore.setState({ notes: [meta] });
    (api.getNote as ReturnType<typeof vi.fn>).mockResolvedValue(note);

    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    await useNoteStore.getState().openNoteByPath('docs/readme.md');

    expect(api.getNote).toHaveBeenCalledWith('path-1');
    pushStateSpy.mockRestore();
  });

  it('does nothing when path does not match any note', async () => {
    useNoteStore.setState({ notes: [] });

    await useNoteStore.getState().openNoteByPath('nonexistent/path.md');

    expect(api.getNote).not.toHaveBeenCalled();
  });
});

describe('parallel isolation', () => {
  it('each test starts with empty notes (isolation check A)', () => {
    expect(useNoteStore.getState().notes).toHaveLength(0);
  });

  it('each test starts with no activeNote (isolation check B)', () => {
    expect(useNoteStore.getState().activeNote).toBeNull();
  });
});
