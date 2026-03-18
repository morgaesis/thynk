import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';

function getHTML(ed: Editor): string {
  return ed.getHTML();
}

function setMarkdownContent(ed: Editor, content: string) {
  if (!content) {
    ed.commands.setContent('', { emitUpdate: false });
    return;
  }
  
  if (content.includes('<p>') || content.includes('<h') || content.includes('<ul>') || content.includes('<ol>')) {
    ed.commands.setContent(content, { emitUpdate: false });
  } else {
    ed.commands.setContent(content, { 
      contentType: 'markdown'
    } as Parameters<typeof ed.commands.setContent>[1]);
  }
}

describe('HTML storage preserves blank lines', () => {
  const createEditor = () => {
    return new Editor({
      extensions: [
        StarterKit,
        Markdown,
      ],
      content: '',
    });
  };

  it('HTML input preserves empty paragraphs', () => {
    const editor = createEditor();
    
    editor.commands.setContent('<p>Line 1</p><p></p><p>Line 2</p>', { emitUpdate: false });
    
    const json = editor.getJSON();
    expect(json.content?.length).toBe(3);
    expect(json.content?.[1].content).toBeUndefined();
    
    editor.destroy();
  });

  it('HTML roundtrip preserves blank lines', () => {
    const editor = createEditor();
    
    editor.commands.setContent('<p>Line 1</p><p></p><p>Line 2</p>', { emitUpdate: false });
    
    const html = editor.getHTML();
    console.log('HTML output:', html);
    
    const editor2 = createEditor();
    editor2.commands.setContent(html, { emitUpdate: false });
    
    const json2 = editor2.getJSON();
    expect(json2.content?.length).toBe(3);
    
    editor.destroy();
    editor2.destroy();
  });

  it('setMarkdownContent loads HTML correctly', () => {
    const editor = createEditor();
    
    setMarkdownContent(editor, '<p>Line 1</p><p></p><p>Line 2</p>');
    
    const json = editor.getJSON();
    expect(json.content?.length).toBe(3);
    
    const html = getHTML(editor);
    expect(html).toContain('<p></p>');
    
    editor.destroy();
  });

  it('markdown content is loaded and saved as HTML', () => {
    const editor = createEditor();
    
    setMarkdownContent(editor, 'Line 1\n\nLine 2');
    
    const json = editor.getJSON();
    expect(json.content?.length).toBe(2);
    
    const html = getHTML(editor);
    expect(html).toContain('<p>Line 1</p>');
    expect(html).toContain('<p>Line 2</p>');
    
    editor.destroy();
  });
});
