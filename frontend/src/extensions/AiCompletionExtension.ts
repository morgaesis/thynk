import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface AiCompletionState {
  active: boolean;
  prompt: string;
  from: number;
  to: number;
  anchorRect: DOMRect | null;
  loading: boolean;
  suggestions: string[];
  selectedIndex: number;
}

const AI_COMPLETION_KEY = new PluginKey<AiCompletionState>('aiCompletion');

export function getAiCompletionState(editorState: unknown): AiCompletionState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (AI_COMPLETION_KEY.getState(editorState as any) ?? {
    active: false,
    prompt: '',
    from: 0,
    to: 0,
    anchorRect: null,
    loading: false,
    suggestions: [],
    selectedIndex: 0,
  }) as AiCompletionState;
}

interface AiCompletionOptions {
  onStateChange?: (state: AiCompletionState) => void;
  onFetchCompletions?: (prompt: string) => Promise<string[]>;
}

export const AiCompletionExtension = Extension.create<AiCompletionOptions>({
  name: 'aiCompletion',

  addOptions() {
    return { onStateChange: undefined, onFetchCompletions: undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: AI_COMPLETION_KEY,
        state: {
          init(): AiCompletionState {
            return {
              active: false,
              prompt: '',
              from: 0,
              to: 0,
              anchorRect: null,
              loading: false,
              suggestions: [],
              selectedIndex: 0,
            };
          },
          apply(tr, prev): AiCompletionState {
            const { selection } = tr;
            if (!selection.empty) return { ...prev, active: false, suggestions: [] };
            const { $from } = selection;
            const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
            const aiMatch = /(?:^|\s)(::ai\s*)$/.exec(textBefore);
            if (aiMatch) {
              const from = $from.pos - aiMatch[1].length;
              const to = $from.pos;
              return { ...prev, active: true, prompt: '', from, to, suggestions: [], selectedIndex: 0 };
            }
            return { ...prev, active: false, suggestions: [] };
          },
        },
        props: {
          decorations(state) {
            const aiState = AI_COMPLETION_KEY.getState(state);
            if (!aiState?.active || !aiState.from) return DecorationSet.empty;
            return DecorationSet.create(state.doc, [
              Decoration.inline(aiState.from, aiState.to, {
                class: 'ai-completion-highlight',
              }),
            ]);
          },
        },
        view() {
          return {
            update(view) {
              const state = AI_COMPLETION_KEY.getState(view.state);
              if (state && options.onStateChange) {
                if (state.active && state.to > 0) {
                  try {
                    const coords = view.coordsAtPos(state.to);
                    const rect = new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
                    options.onStateChange({ ...state, anchorRect: rect });
                  } catch {
                    options.onStateChange(state);
                  }
                } else {
                  options.onStateChange(state);
                }
              }
            },
          };
        },
      }),
    ];
  },
});
