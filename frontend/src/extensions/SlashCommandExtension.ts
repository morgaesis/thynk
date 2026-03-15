import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SlashCommandState {
  active: boolean;
  query: string;
  from: number;
  to: number;
  anchorRect: DOMRect | null;
}

const SLASH_KEY = new PluginKey<SlashCommandState>('slashCommand');

export function getSlashCommandState(editorState: unknown): SlashCommandState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (SLASH_KEY.getState(editorState as any) ?? { active: false, query: '', from: 0, to: 0, anchorRect: null }) as SlashCommandState;
}

interface SlashCommandOptions {
  onStateChange?: (state: SlashCommandState) => void;
}

export const SlashCommandExtension = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { onStateChange: undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: SLASH_KEY,
        state: {
          init(): SlashCommandState {
            return { active: false, query: '', from: 0, to: 0, anchorRect: null };
          },
          apply(tr, prev): SlashCommandState {
            const { selection } = tr;
            if (!selection.empty) return { ...prev, active: false };
            const { $from } = selection;
            const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
            // Match a slash command: / at start of block or after whitespace
            const slashMatch = /(?:^|\s)(\/[^\s]*)$/.exec(textBefore);
            if (slashMatch) {
              const query = slashMatch[1];
              const from = $from.pos - query.length;
              const to = $from.pos;
              return { active: true, query, from, to, anchorRect: null };
            }
            return { active: false, query: '', from: 0, to: 0, anchorRect: null };
          },
        },
        props: {
          decorations(state) {
            const slashState = SLASH_KEY.getState(state);
            if (!slashState?.active || !slashState.from) return DecorationSet.empty;
            return DecorationSet.create(state.doc, [
              Decoration.inline(slashState.from, slashState.to, {
                class: 'slash-command-highlight',
              }),
            ]);
          },
        },
        view() {
          return {
            update(view) {
              const state = SLASH_KEY.getState(view.state);
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
