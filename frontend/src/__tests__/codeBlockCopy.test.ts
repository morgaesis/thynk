import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';

const lowlight = createLowlight(common);

const mockClipboard = {
  writeText: vi.fn(),
};
Object.defineProperty(navigator, 'clipboard', {
  value: mockClipboard,
  writable: true,
});

describe('Code Block Copy Button', () => {
  let editor: Editor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClipboard.writeText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (editor) {
      editor.destroy();
      editor = undefined;
    }
  });

  it('should create editor with code block content', () => {
    const testCode = 'console.log("test")';
    editor = new Editor({
      extensions: [
        StarterKit.configure({
          codeBlock: false,
        }),
        CodeBlockLowlight.configure({
          lowlight,
        }),
      ],
      content: `<pre><code>${testCode}</code></pre>`,
      editorProps: {
        attributes: {
          class: 'prose',
        },
      },
    });

    const doc = editor.state.doc;
    let foundCodeBlock = false;
    doc.forEach((node) => {
      if (node.type.name === 'codeBlock') {
        foundCodeBlock = true;
        expect(node.textContent).toBe(testCode);
      }
    });
    expect(foundCodeBlock).toBe(true);
  });

  it('should extract code block text for clipboard', async () => {
    const testCode = 'const x = 1;\nconst y = 2;';
    editor = new Editor({
      extensions: [
        StarterKit.configure({
          codeBlock: false,
        }),
        CodeBlockLowlight.configure({
          lowlight,
        }),
      ],
      content: `<pre><code>${testCode}</code></pre>`,
      editorProps: {
        attributes: {
          class: 'prose',
        },
      },
    });

    const doc = editor.state.doc;
    let codeText = '';
    doc.forEach((node) => {
      if (node.type.name === 'codeBlock') {
        codeText = node.textContent;
      }
    });

    expect(codeText).toBe(testCode);

    await navigator.clipboard.writeText(codeText);
    expect(mockClipboard.writeText).toHaveBeenCalledWith(testCode);
  });

  it('should handle code block with language attribute', () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({
          codeBlock: false,
        }),
        CodeBlockLowlight.configure({
          lowlight,
        }),
      ],
      content: '<pre><code class="language-typescript">const x: number = 1;</code></pre>',
      editorProps: {
        attributes: {
          class: 'prose',
        },
      },
    });

    const doc = editor.state.doc;
    let codeText = '';
    doc.forEach((node) => {
      if (node.type.name === 'codeBlock') {
        codeText = node.textContent;
        expect(node.attrs.language).toBe('typescript');
      }
    });
    expect(codeText).toBe('const x: number = 1;');
  });
});
