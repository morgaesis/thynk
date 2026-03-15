import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const FILE_UPLOAD_PLUGIN_KEY = new PluginKey('fileUpload');

export interface FileUploadOptions {
  /**
   * Called when files are pasted or dropped. Should return a promise that
   * resolves to the URL of the uploaded file and filename.
   */
  onUpload: (
    file: File,
  ) => Promise<{ url: string; filename: string } | null>;
}

/** Build markdown for a pasted/dropped file. */
function buildMarkdown(
  filename: string,
  url: string,
  contentType: string,
): string {
  if (contentType.startsWith('image/')) {
    return `![${filename}](${url})`;
  }
  return `[${filename}](${url})`;
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

    return [
      new Plugin({
        key: FILE_UPLOAD_PLUGIN_KEY,
        props: {
          handlePaste(_view, event) {
            const items = Array.from(event.clipboardData?.items ?? []);
            const fileItems = items.filter(
              (item) => item.kind === 'file',
            );
            if (fileItems.length === 0) return false;

            event.preventDefault();

            for (const item of fileItems) {
              const file = item.getAsFile();
              if (!file) continue;
              const contentType =
                file.type || 'application/octet-stream';

              // Insert placeholder, then replace with final markdown.
              const placeholder = `\n⏳ Uploading ${file.name}…\n`;
              editor.chain().insertContent(placeholder).run();

              void onUpload(file).then((result) => {
                if (!result) return;
                const markdown = buildMarkdown(
                  result.filename,
                  result.url,
                  contentType,
                );
                // Replace the placeholder text with the actual markdown.
                const content = editor.getText();
                const idx = content.lastIndexOf(placeholder);
                if (idx !== -1) {
                  // Use replaceAll to swap placeholder for the markdown link.
                  editor
                    .chain()
                    .command(({ tr, state }) => {
                      const text = state.doc.textContent;
                      const start = text.lastIndexOf(
                        `⏳ Uploading ${file.name}…`,
                      );
                      if (start === -1) return false;
                      // Find ProseMirror positions for the placeholder.
                      let pmStart = -1;
                      let pmEnd = -1;
                      state.doc.descendants((node, nodePos) => {
                        if (node.isText && node.text) {
                          const nodeText = node.text;
                          const needle = `⏳ Uploading ${file.name}…`;
                          const offset = nodeText.indexOf(needle);
                          if (offset !== -1 && pmStart === -1) {
                            pmStart = nodePos + offset;
                            pmEnd = pmStart + needle.length;
                          }
                        }
                        return true;
                      });
                      if (pmStart === -1) return false;
                      tr.replaceWith(
                        pmStart,
                        pmEnd,
                        state.schema.text(markdown),
                      );
                      return true;
                    })
                    .run();
                } else {
                  editor.chain().insertContent(markdown).run();
                }
              });
            }

            return true;
          },

          handleDrop(_view, event) {
            const items = Array.from(event.dataTransfer?.files ?? []);
            if (items.length === 0) return false;

            event.preventDefault();

            for (const file of items) {
              const contentType =
                file.type || 'application/octet-stream';
              const placeholder = `\n⏳ Uploading ${file.name}…\n`;
              editor.chain().insertContent(placeholder).run();

              void onUpload(file).then((result) => {
                if (!result) return;
                const markdown = buildMarkdown(
                  result.filename,
                  result.url,
                  contentType,
                );
                editor
                  .chain()
                  .command(({ tr, state }) => {
                    const needle = `⏳ Uploading ${file.name}…`;
                    let pmStart = -1;
                    let pmEnd = -1;
                    state.doc.descendants((node, nodePos) => {
                      if (node.isText && node.text) {
                        const offset = node.text.indexOf(needle);
                        if (offset !== -1 && pmStart === -1) {
                          pmStart = nodePos + offset;
                          pmEnd = pmStart + needle.length;
                        }
                      }
                      return true;
                    });
                    if (pmStart === -1) return false;
                    tr.replaceWith(
                      pmStart,
                      pmEnd,
                      state.schema.text(markdown),
                    );
                    return true;
                  })
                  .run();
              });
            }

            return true;
          },
        },
      }),
    ];
  },
});
