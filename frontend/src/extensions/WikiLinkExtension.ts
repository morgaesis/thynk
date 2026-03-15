import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const WIKI_LINK_PLUGIN_KEY = new PluginKey('wikiLink');

const WIKI_LINK_RE = /\[\[([^\][\n]+?)\]\]/g;

export interface WikiLinkOptions {
  /**
   * Called when a wiki-link is clicked. Receives the note title.
   */
  onNavigate?: (title: string) => void;
}

/**
 * WikiLinkExtension – decorates [[Note Title]] syntax in the editor with a
 * styled inline widget. Clicking the decoration navigates to that note via
 * the provided onNavigate callback.
 *
 * The extension does NOT convert [[...]] to a ProseMirror node/mark; instead
 * it uses decorations so the raw syntax remains in the markdown document and
 * the serializer continues to work unchanged.
 */
export const WikiLinkExtension = Extension.create<WikiLinkOptions>({
  name: 'wikiLink',

  addOptions() {
    return {
      onNavigate: undefined,
    };
  },

  addProseMirrorPlugins() {
    const { onNavigate } = this.options;

    return [
      new Plugin({
        key: WIKI_LINK_PLUGIN_KEY,

        props: {
          decorations(state) {
            const { doc } = state;
            const decorations: Decoration[] = [];

            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              const text = node.text;
              let match: RegExpExecArray | null;
              WIKI_LINK_RE.lastIndex = 0;
              while ((match = WIKI_LINK_RE.exec(text)) !== null) {
                const from = pos + match.index;
                const to = from + match[0].length;
                const title = match[1].trim();
                decorations.push(
                  Decoration.inline(from, to, {
                    class: 'wiki-link',
                    'data-note-title': title,
                    title: `Open note: ${title}`,
                  }),
                );
              }
            });

            return DecorationSet.create(doc, decorations);
          },

          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement;
            if (target.classList.contains('wiki-link')) {
              const title = target.getAttribute('data-note-title');
              if (title && onNavigate) {
                onNavigate(title);
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
