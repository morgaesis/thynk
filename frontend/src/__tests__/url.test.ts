import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import { useNoteStore } from '../stores/noteStore';
import type { Note, NoteMetadata } from '../types';

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'url-note-1',
  path: 'notes/url-test.md',
  title: 'URL Test Note',
  content: '# URL Test Note',
  content_hash: 'hash1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

const makeMeta = (overrides: Partial<NoteMetadata> = {}): NoteMetadata => ({
  id: 'url-note-1',
  path: 'notes/url-test.md',
  title: 'URL Test Note',
  content_hash: 'hash1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

let pushStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  useNoteStore.setState({
    notes: [],
    activeNote: null,
    loading: false,
    saving: false,
    error: null,
  });
  vi.clearAllMocks();
  pushStateSpy = vi.spyOn(window.history, 'pushState');
});

afterEach(() => {
  pushStateSpy.mockRestore();
});

describe('URL updates when opening a note', () => {
  it('updates the URL to use the note path (not UUID) when opening a note', async () => {
    const note = makeNote({ id: 'abc-123', path: 'projects/my-project.md' });
    (api.getNote as ReturnType<typeof vi.fn>).mockResolvedValue(note);

    await useNoteStore.getState().openNote('abc-123');

    expect(pushStateSpy).toHaveBeenCalledWith(
      {},
      '',
      '/notes/projects%2Fmy-project.md',
    );
  });

  it('URL-encodes spaces in the note path', async () => {
    const note = makeNote({ id: 'space-note', path: 'my notes/hello world.md' });
    (api.getNote as ReturnType<typeof vi.fn>).mockResolvedValue(note);

    await useNoteStore.getState().openNote('space-note');

    const calledUrl = pushStateSpy.mock.calls[0][2] as string;
    expect(calledUrl).toBe('/notes/my%20notes%2Fhello%20world.md');
  });

  it('URL-encodes special characters in the note path', async () => {
    const note = makeNote({ id: 'special-note', path: 'docs/c++ guide.md' });
    (api.getNote as ReturnType<typeof vi.fn>).mockResolvedValue(note);

    await useNoteStore.getState().openNote('special-note');

    const calledUrl = pushStateSpy.mock.calls[0][2] as string;
    expect(calledUrl).toContain('/notes/');
    // The path should be URL-encoded
    expect(calledUrl).not.toContain(' ');
  });

  it('sets activeNote after opening', async () => {
    const note = makeNote({ id: 'act-1', path: 'active/note.md' });
    (api.getNote as ReturnType<typeof vi.fn>).mockResolvedValue(note);

    await useNoteStore.getState().openNote('act-1');

    expect(useNoteStore.getState().activeNote?.id).toBe('act-1');
  });
});

describe('URL parse correctly extracts path and calls openNoteByPath', () => {
  it('openNoteByPath finds a note by path and calls getNote', async () => {
    const meta = makeMeta({ id: 'path-note-1', path: 'docs/readme.md' });
    const note = makeNote({ id: 'path-note-1', path: 'docs/readme.md' });
    useNoteStore.setState({ notes: [meta] });
    (api.getNote as ReturnType<typeof vi.fn>).mockResolvedValue(note);

    await useNoteStore.getState().openNoteByPath('docs/readme.md');

    expect(api.getNote).toHaveBeenCalledWith('path-note-1');
    expect(useNoteStore.getState().activeNote?.path).toBe('docs/readme.md');
  });

  it('pushState encodes the path segment so it can be decoded back', async () => {
    const originalPath = 'projects/my note with spaces.md';
    const note = makeNote({ id: 'enc-1', path: originalPath });
    (api.getNote as ReturnType<typeof vi.fn>).mockResolvedValue(note);

    await useNoteStore.getState().openNote('enc-1');

    const calledUrl = pushStateSpy.mock.calls[0][2] as string;
    // Verify we can decode the path back from the URL
    const match = calledUrl.match(/^\/notes\/(.+)$/);
    expect(match).not.toBeNull();
    const decodedPath = decodeURIComponent(match![1]);
    expect(decodedPath).toBe(originalPath);
  });

  it('does not update URL when no note matches the path', async () => {
    useNoteStore.setState({ notes: [] });

    await useNoteStore.getState().openNoteByPath('nonexistent/note.md');

    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(api.getNote).not.toHaveBeenCalled();
  });
});
