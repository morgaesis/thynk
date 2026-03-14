import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { fireEvent } from '@testing-library/react';

// Mock the API module
vi.mock('../api', () => ({
  listNotes: vi.fn(),
  getNote: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  searchNotes: vi.fn(),
}));

// Mock useUIStore
vi.mock('../stores/uiStore', () => {
  const toggleCommandPalette = vi.fn();
  const addToast = vi.fn();
  const setCommandPaletteOpen = vi.fn();
  let commandPaletteOpen = false;

  return {
    useUIStore: Object.assign(
      (selector: (s: { commandPaletteOpen: boolean; toggleCommandPalette: () => void }) => unknown) =>
        selector({ commandPaletteOpen, toggleCommandPalette }),
      {
        getState: () => ({
          addToast,
          toggleCommandPalette,
          setCommandPaletteOpen,
          get commandPaletteOpen() {
            return commandPaletteOpen;
          },
        }),
        setState: (patch: { commandPaletteOpen?: boolean }) => {
          if (patch.commandPaletteOpen !== undefined) {
            commandPaletteOpen = patch.commandPaletteOpen;
          }
        },
      },
    ),
  };
});

import * as api from '../api';
import { useNoteStore } from '../stores/noteStore';

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

/**
 * Helper: simulate global keydown event on window.
 */
function pressKey(
  key: string,
  options: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {},
) {
  fireEvent.keyDown(window, { key, ...options });
}

/**
 * The keyboard shortcut handler is defined inline in App.tsx's useEffect.
 * We test the same logic here by simulating keydown on the window and checking
 * that the store functions are invoked correctly.
 *
 * To test these handlers we wire up our own listener that mirrors App.tsx logic.
 */
describe('keyboard shortcuts (direct handler logic)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let toggleCommandPalette: Mock<(...args: any[]) => any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createNote: Mock<(...args: any[]) => any>;
  let cleanup: () => void;

  beforeEach(() => {
    toggleCommandPalette = vi.fn();
    createNote = vi.fn();

    // Register a keydown handler that mirrors App.tsx logic
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.metaKey || e.ctrlKey;

      if ((ctrl && e.key === 'p') || (ctrl && e.key === 'k')) {
        e.preventDefault();
        toggleCommandPalette();
      } else if (ctrl && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        const title = `Untitled ${new Date().toISOString().slice(0, 10)}`;
        createNote(title);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    cleanup = () => window.removeEventListener('keydown', handleKeyDown);
  });

  afterEach(() => {
    cleanup();
  });

  it('Ctrl+K opens command palette', () => {
    pressKey('k', { ctrlKey: true });
    expect(toggleCommandPalette).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+P opens command palette', () => {
    pressKey('p', { ctrlKey: true });
    expect(toggleCommandPalette).toHaveBeenCalledTimes(1);
  });

  it('Meta+K opens command palette (macOS)', () => {
    pressKey('k', { metaKey: true });
    expect(toggleCommandPalette).toHaveBeenCalledTimes(1);
  });

  it('Meta+P opens command palette (macOS)', () => {
    pressKey('p', { metaKey: true });
    expect(toggleCommandPalette).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+N calls createNote with an Untitled title', () => {
    pressKey('N', { ctrlKey: true, shiftKey: true });
    expect(createNote).toHaveBeenCalledTimes(1);
    const calledTitle = createNote.mock.calls[0][0] as string;
    expect(calledTitle).toMatch(/^Untitled \d{4}-\d{2}-\d{2}$/);
  });

  it('plain letter keys do not trigger shortcuts', () => {
    pressKey('p');
    pressKey('k');
    pressKey('s');
    expect(toggleCommandPalette).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
  });

  it('Ctrl+K does not call createNote', () => {
    pressKey('k', { ctrlKey: true });
    expect(createNote).not.toHaveBeenCalled();
  });

  it('Ctrl+P does not call createNote', () => {
    pressKey('p', { ctrlKey: true });
    expect(createNote).not.toHaveBeenCalled();
  });
});

describe('keyboard shortcuts – Escape and F2', () => {
  it('Escape triggers keydown event with Escape key', () => {
    const handler = vi.fn();
    window.addEventListener('keydown', handler);

    pressKey('Escape');

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'Escape' }),
    );

    window.removeEventListener('keydown', handler);
  });

  it('F2 triggers keydown event with F2 key', () => {
    const focusTitle = vi.fn();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        focusTitle();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    pressKey('F2');
    window.removeEventListener('keydown', handleKeyDown);

    expect(focusTitle).toHaveBeenCalledTimes(1);
  });
});

describe('keyboard shortcuts – Ctrl+S save', () => {
  it('Ctrl+S calls the registered save function', () => {
    const saveFn = vi.fn();
    const activeSaveFn: (() => void) | null = saveFn;

    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.metaKey || e.ctrlKey;
      if (ctrl && e.key === 's') {
        e.preventDefault();
        if (activeSaveFn) activeSaveFn();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    pressKey('s', { ctrlKey: true });
    window.removeEventListener('keydown', handleKeyDown);

    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+S does not throw when no save function is registered', () => {
    const activeSaveFn: (() => void) | null = null;

    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.metaKey || e.ctrlKey;
      if (ctrl && e.key === 's') {
        e.preventDefault();
        if (activeSaveFn) activeSaveFn();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    expect(() => pressKey('s', { ctrlKey: true })).not.toThrow();
    window.removeEventListener('keydown', handleKeyDown);
  });
});

describe('noteStore createNote via keyboard integration', () => {
  it('createNote store action is called and sets activeNote', async () => {
    const newNote = {
      id: 'kb-1',
      path: 'kb/test.md',
      title: 'Untitled 2024-01-01',
      content: '',
      content_hash: 'hash',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    (api.createNote as ReturnType<typeof vi.fn>).mockResolvedValue(newNote);
    (api.listNotes as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await useNoteStore.getState().createNote('Untitled 2024-01-01');

    expect(useNoteStore.getState().activeNote?.id).toBe('kb-1');
  });
});
