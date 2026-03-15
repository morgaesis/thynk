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

    /** Replace the first occurrence of placeholder text in the document. */
    function replacePlaceholder(placeholder: string, replacement: string) {
      editor
        .chain()
        .command(({ tr, state }) => {
          let pmStart = -1;
          let pmEnd = -1;
          state.doc.descendants((node, nodePos) => {
            if (node.isText && node.text) {
              const offset = node.text.indexOf(placeholder);
              if (offset !== -1 && pmStart === -1) {
                pmStart = nodePos + offset;
                pmEnd = pmStart + placeholder.length;
              }
            }
            return pmStart === -1; // stop traversal once found
          });
          if (pmStart === -1) return false;
          tr.replaceWith(pmStart, pmEnd, state.schema.text(replacement));
          return true;
        })
        .run();
    }

    function handleFile(file: File) {
      const contentType = file.type || 'application/octet-stream';
      const placeholder = `⏳ Uploading ${file.name}…`;

      editor.chain().insertContent(`\n${placeholder}\n`).run();

      void onUpload(file).then((result) => {
        if (!result) {
          replacePlaceholder(placeholder, `❌ Upload failed: ${file.name}`);
          return;
        }
        const markdown = buildMarkdown(result.filename, result.url, contentType);
        replacePlaceholder(placeholder, markdown);
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
