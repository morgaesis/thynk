import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  deleteSelection,
  joinBackward,
  selectNodeBackward,
} from '@tiptap/pm/commands';

export type VimMode = 'normal' | 'insert' | 'visual';

const vimPluginKey = new PluginKey<VimPluginState>('vimMode');

interface VimPluginState {
  mode: VimMode;
  pendingKey: string;
}

function createInitialState(): VimPluginState {
  return { mode: 'normal', pendingKey: '' };
}

export interface VimModeOptions {
  onModeChange?: (mode: VimMode) => void;
}

/**
 * A basic Vim mode extension for TipTap.
 * Supports Normal, Insert, and Visual modes with common navigation bindings.
 */
export const VimModeExtension = Extension.create<VimModeOptions>({
  name: 'vimMode',

  addOptions() {
    return {
      onModeChange: undefined,
    };
  },

  addProseMirrorPlugins() {
    const { onModeChange } = this.options;

    return [
      new Plugin({
        key: vimPluginKey,

        state: {
          init(): VimPluginState {
            return createInitialState();
          },
          apply(tr: Transaction, prev: VimPluginState): VimPluginState {
            const meta = tr.getMeta(vimPluginKey) as
              | Partial<VimPluginState>
              | undefined;
            if (meta) {
              return { ...prev, ...meta };
            }
            return prev;
          },
        },

        props: {
          handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
            const pluginState = vimPluginKey.getState(view.state);
            if (!pluginState) return false;

            const mode = pluginState.mode;

            // Always allow Ctrl/Meta combinations through
            if (event.ctrlKey || event.metaKey) return false;

            if (mode === 'insert') {
              if (event.key === 'Escape') {
                event.preventDefault();
                const tr = view.state.tr.setMeta(vimPluginKey, {
                  mode: 'normal',
                  pendingKey: '',
                });
                view.dispatch(tr);
                onModeChange?.('normal');
                return true;
              }
              return false;
            }

            if (mode === 'visual') {
              return handleVisualMode(view, event, onModeChange);
            }

            // Normal mode
            return handleNormalMode(view, event, pluginState, onModeChange);
          },
        },
      }),
    ];
  },
});

function setMode(
  view: EditorView,
  mode: VimMode,
  onModeChange?: (mode: VimMode) => void,
) {
  const tr = view.state.tr.setMeta(vimPluginKey, { mode, pendingKey: '' });
  view.dispatch(tr);
  onModeChange?.(mode);
}

function handleVisualMode(
  view: EditorView,
  event: KeyboardEvent,
  onModeChange?: (mode: VimMode) => void,
): boolean {
  const { state, dispatch } = view;

  switch (event.key) {
    case 'Escape':
    case 'i':
      event.preventDefault();
      // Collapse selection and go to normal mode
      dispatch(state.tr.setSelection(Selection.near(state.selection.$head)));
      setMode(view, 'normal', onModeChange);
      return true;

    case 'h': {
      event.preventDefault();
      const { from } = state.selection;
      if (from > 0) {
        const newFrom = Math.max(0, from - 1);
        const newSel = TextSelection.create(
          state.doc,
          newFrom,
          state.selection.to,
        );
        dispatch(state.tr.setSelection(newSel));
      }
      return true;
    }

    case 'l': {
      event.preventDefault();
      const { to } = state.selection;
      if (to < state.doc.content.size) {
        const newTo = Math.min(state.doc.content.size, to + 1);
        const newSel = TextSelection.create(
          state.doc,
          state.selection.from,
          newTo,
        );
        dispatch(state.tr.setSelection(newSel));
      }
      return true;
    }

    case 'd':
    case 'x': {
      event.preventDefault();
      if (!state.selection.empty) {
        deleteSelection(state, dispatch);
      }
      setMode(view, 'normal', onModeChange);
      return true;
    }

    case 'y': {
      event.preventDefault();
      // Copy selection (just collapse and return to normal)
      setMode(view, 'normal', onModeChange);
      return true;
    }
  }
  return false;
}

function moveCursorHorizontal(view: EditorView, delta: number) {
  const { state, dispatch } = view;
  const { selection } = state;
  const pos = Math.max(
    0,
    Math.min(state.doc.content.size, selection.from + delta),
  );
  try {
    const sel = Selection.near(state.doc.resolve(pos));
    dispatch(state.tr.setSelection(sel));
  } catch {
    // ignore invalid positions
  }
}

function moveCursorVertical(view: EditorView, delta: number) {
  const { state } = view;
  const { selection } = state;
  const coords = view.coordsAtPos(selection.from);
  const lineHeight = 24; // approximate
  const targetCoords = {
    left: coords.left,
    top: coords.top + delta * lineHeight,
  };
  const pos = view.posAtCoords(targetCoords);
  if (pos) {
    try {
      const sel = Selection.near(state.doc.resolve(pos.pos));
      view.dispatch(state.tr.setSelection(sel));
    } catch {
      // ignore
    }
  }
}

function handleNormalMode(
  view: EditorView,
  event: KeyboardEvent,
  pluginState: VimPluginState,
  onModeChange?: (mode: VimMode) => void,
): boolean {
  const { state, dispatch } = view;
  const pending = pluginState.pendingKey;

  // Enter insert mode
  if (event.key === 'i') {
    event.preventDefault();
    setMode(view, 'insert', onModeChange);
    return true;
  }

  if (event.key === 'a') {
    event.preventDefault();
    // Move cursor right then insert
    moveCursorHorizontal(view, 1);
    setMode(view, 'insert', onModeChange);
    return true;
  }

  if (event.key === 'A') {
    event.preventDefault();
    // Go to end of line then insert
    const { $from } = state.selection;
    const end = $from.end();
    try {
      const sel = Selection.near(state.doc.resolve(end));
      dispatch(state.tr.setSelection(sel));
    } catch {
      // ignore
    }
    setMode(view, 'insert', onModeChange);
    return true;
  }

  if (event.key === 'o') {
    event.preventDefault();
    // Open new line below
    const { $from } = state.selection;
    const end = $from.end();
    const insertPos = end;
    dispatch(
      state.tr.insert(
        insertPos,
        state.schema.nodes.paragraph?.create() ?? state.schema.text('\n'),
      ),
    );
    setMode(view, 'insert', onModeChange);
    return true;
  }

  // Enter visual mode
  if (event.key === 'v') {
    event.preventDefault();
    setMode(view, 'visual', onModeChange);
    return true;
  }

  // Navigation: h/j/k/l
  if (event.key === 'h') {
    event.preventDefault();
    moveCursorHorizontal(view, -1);
    return true;
  }
  if (event.key === 'l') {
    event.preventDefault();
    moveCursorHorizontal(view, 1);
    return true;
  }
  if (event.key === 'j') {
    event.preventDefault();
    moveCursorVertical(view, 1);
    return true;
  }
  if (event.key === 'k') {
    event.preventDefault();
    moveCursorVertical(view, -1);
    return true;
  }

  // Word movement: w (forward word), b (back word)
  if (event.key === 'w') {
    event.preventDefault();
    const { from } = state.selection;
    const text = state.doc.textBetween(from, state.doc.content.size, ' ');
    const nextWordBoundary = text.search(/\s\S/);
    if (nextWordBoundary >= 0) {
      moveCursorHorizontal(view, nextWordBoundary + 1);
    }
    return true;
  }

  if (event.key === 'b') {
    event.preventDefault();
    const { from } = state.selection;
    if (from > 0) {
      const text = state.doc.textBetween(0, from, ' ');
      const lastWordBoundary = text.search(/\S+\s*$/);
      if (lastWordBoundary >= 0) {
        const offset = from - (text.length - lastWordBoundary);
        moveCursorHorizontal(view, -offset);
      }
    }
    return true;
  }

  // Line start/end: 0 and $
  if (event.key === '0') {
    event.preventDefault();
    const { $from } = state.selection;
    const start = $from.start();
    try {
      const sel = Selection.near(state.doc.resolve(start));
      dispatch(state.tr.setSelection(sel));
    } catch {
      // ignore
    }
    return true;
  }

  if (event.key === '$') {
    event.preventDefault();
    const { $from } = state.selection;
    const end = $from.end();
    try {
      const sel = Selection.near(state.doc.resolve(end));
      dispatch(state.tr.setSelection(sel));
    } catch {
      // ignore
    }
    return true;
  }

  // Document start/end: gg, G
  if (event.key === 'G' && !event.shiftKey) {
    event.preventDefault();
    const end = state.doc.content.size;
    try {
      const sel = Selection.near(state.doc.resolve(end - 1));
      dispatch(state.tr.setSelection(sel));
    } catch {
      // ignore
    }
    return true;
  }

  // 'gg' — first 'g' sets pendingKey, second 'g' goes to doc start
  if (event.key === 'g') {
    event.preventDefault();
    if (pending === 'g') {
      // Go to document start
      try {
        const sel = Selection.near(state.doc.resolve(1));
        dispatch(
          state.tr
            .setSelection(sel)
            .setMeta(vimPluginKey, { mode: 'normal', pendingKey: '' }),
        );
      } catch {
        dispatch(
          state.tr.setMeta(vimPluginKey, { mode: 'normal', pendingKey: '' }),
        );
      }
    } else {
      // Set pending key
      dispatch(
        state.tr.setMeta(vimPluginKey, { mode: 'normal', pendingKey: 'g' }),
      );
    }
    return true;
  }

  // Delete: x (delete char under cursor), dd (delete line)
  if (event.key === 'x') {
    event.preventDefault();
    const { from } = state.selection;
    if (from < state.doc.content.size) {
      dispatch(state.tr.delete(from, from + 1));
    }
    return true;
  }

  if (event.key === 'd') {
    event.preventDefault();
    if (pending === 'd') {
      // Delete current line (paragraph)
      const { $from } = state.selection;
      const nodeStart = $from.before($from.depth);
      const nodeEnd = $from.after($from.depth);
      dispatch(
        state.tr
          .delete(nodeStart, nodeEnd)
          .setMeta(vimPluginKey, { mode: 'normal', pendingKey: '' }),
      );
    } else {
      dispatch(
        state.tr.setMeta(vimPluginKey, { mode: 'normal', pendingKey: 'd' }),
      );
    }
    return true;
  }

  // Yank: yy (copy line — just clears pending)
  if (event.key === 'y') {
    event.preventDefault();
    if (pending === 'y') {
      dispatch(
        state.tr.setMeta(vimPluginKey, { mode: 'normal', pendingKey: '' }),
      );
    } else {
      dispatch(
        state.tr.setMeta(vimPluginKey, { mode: 'normal', pendingKey: 'y' }),
      );
    }
    return true;
  }

  // Undo: u
  if (event.key === 'u') {
    event.preventDefault();
    // Let TipTap handle undo
    return false;
  }

  // Backspace (delete backwards in normal mode)
  if (event.key === 'Backspace') {
    event.preventDefault();
    void (joinBackward(state, dispatch) || selectNodeBackward(state, dispatch));
    return true;
  }

  // Absorb other keys in normal mode to prevent unwanted typing
  // But allow function keys, arrows, etc.
  const absorbed = [
    'p',
    'P',
    'c',
    'C',
    'r',
    'R',
    's',
    'S',
    'n',
    'N',
    'f',
    'F',
    't',
    'T',
    'e',
    'E',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '/',
    '?',
    ':',
    ';',
    ',',
    '.',
  ];

  if (absorbed.includes(event.key)) {
    event.preventDefault();
    return true;
  }

  return false;
}

/** Get the current vim mode from the editor state. */
export function getVimMode(state: EditorState): VimMode {
  return vimPluginKey.getState(state)?.mode ?? 'normal';
}
