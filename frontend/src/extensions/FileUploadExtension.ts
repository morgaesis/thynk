import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const FILE_UPLOAD_PLUGIN_KEY = new PluginKey('fileUpload');

export interface FileUploadOptions {
  /**
   * Called when files are pasted or dropped. Should return a promise that
   * resolves to the URL of the uploaded file and filename, or null on failure.
   */
  onUpload: (file: File) => Promise<{ url: string; filename: string } | null>;
}

export const FileUploadExtension = Extension.create<FileUploadOptions>({
  name: 'fileUpload',

  addOptions() {
    return {
      onUpload: async () => null,
    };
  },

  addProseMirrorPlugins() {
    const { onUpload } = this.options;
    const editor = this.editor;

    /** Find and remove a placeholder text span from the document. */
    function removePlaceholder(placeholder: string) {
      editor
        .chain()
        .command(({ tr, state }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (found) return false;
            if (node.isText && node.text?.includes(placeholder)) {
              const offset = node.text.indexOf(placeholder);
              const from = pos + offset;
              const to = from + placeholder.length;
              tr.delete(from, to);
              found = true;
              return false;
            }
            return true;
          });
          return found;
        })
        .run();
    }

    /** Replace a placeholder text span with an image node. */
    function replaceWithImage(placeholder: string, src: string, alt: string) {
      editor
        .chain()
        .command(({ tr, state }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (found) return false;
            if (node.isText && node.text?.includes(placeholder)) {
              const offset = node.text.indexOf(placeholder);
              const from = pos + offset;
              const to = from + placeholder.length;
              const imageNode = state.schema.nodes.image?.create({
                src,
                alt,
                title: null,
              });
              if (imageNode) {
                tr.replaceWith(from, to, imageNode);
                found = true;
              }
              return false;
            }
            return true;
          });
          return found;
        })
        .run();
    }

    /** Replace a placeholder text span with a link markdown string. */
    function replaceWithText(placeholder: string, replacement: string) {
      editor
        .chain()
        .command(({ tr, state }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (found) return false;
            if (node.isText && node.text?.includes(placeholder)) {
              const offset = node.text.indexOf(placeholder);
              const from = pos + offset;
              const to = from + placeholder.length;
              tr.replaceWith(from, to, state.schema.text(replacement));
              found = true;
              return false;
            }
            return true;
          });
          return found;
        })
        .run();
    }

    function handleFile(file: File) {
      const contentType = file.type || 'application/octet-stream';
      const isImage = contentType.startsWith('image/');
      const placeholder = `⏳ Uploading ${file.name}…`;

      editor.chain().insertContent(placeholder).run();

      void onUpload(file).then((result) => {
        if (!result) {
          // Remove placeholder — error toast is shown by the onUpload caller
          removePlaceholder(placeholder);
          return;
        }
        if (isImage) {
          replaceWithImage(placeholder, result.url, result.filename);
        } else {
          replaceWithText(placeholder, `[${result.filename}](${result.url})`);
        }
      });
    }

    return [
      new Plugin({
        key: FILE_UPLOAD_PLUGIN_KEY,
        props: {
          handlePaste(_view, event) {
            const items = Array.from(event.clipboardData?.items ?? []);
            const fileItems = items.filter((item) => item.kind === 'file');
            if (fileItems.length === 0) return false;

            event.preventDefault();

            for (const item of fileItems) {
              const file = item.getAsFile();
              if (!file) continue;
              handleFile(file);
            }

            return true;
          },

          handleDrop(_view, event) {
            const files = Array.from(event.dataTransfer?.files ?? []);
            if (files.length === 0) return false;

            event.preventDefault();

            for (const file of files) {
              handleFile(file);
            }

            return true;
          },
        },
      }),
    ];
  },
});
