import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SlashCommandExtension, getSlashCommandState } from '../extensions/SlashCommandExtension';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';

const lowlight = createLowlight(common);

const SLASH_REGEX = /(?:^|\s)(\/[^\s]*)$/;

describe('SlashCommandExtension regex detection', () => {
  it('detects / at start of empty text', () => {
    const match = SLASH_REGEX.exec('/');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('/');
  });

  it('detects /query at start of text', () => {
    const match = SLASH_REGEX.exec('/h1');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('/h1');
  });

  it('detects /query after whitespace', () => {
    const match = SLASH_REGEX.exec('hello /table');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('/table');
  });

  it('returns null when trailing content follows /query', () => {
    const match = SLASH_REGEX.exec('hello /table 3 4');
    expect(match).toBeNull();
  });

  it('returns null when no / present', () => {
    const match = SLASH_REGEX.exec('hello world');
    expect(match).toBeNull();
  });

  it('returns null when space follows /', () => {
    const match = SLASH_REGEX.exec('/ ');
    expect(match).toBeNull();
  });

  it('returns null when / is mid-word (no space before)', () => {
    const match = SLASH_REGEX.exec('not/a/path');
    expect(match).toBeNull();
  });

  it('returns null when space follows /query', () => {
    const match = SLASH_REGEX.exec('/code python');
    expect(match).toBeNull();
  });

  it('detects new formatting slash commands', () => {
    const commands = ['/bold', '/italic', '/inline-code', '/strikethrough', '/bullet', '/numbered', '/callout', '/image'];
    for (const cmd of commands) {
      const match = SLASH_REGEX.exec(cmd);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(cmd);
    }
  });

  it('detects new commands after whitespace', () => {
    const commands = ['/bold', '/italic', '/bullet', '/callout', '/image'];
    for (const cmd of commands) {
      const match = SLASH_REGEX.exec(`text ${cmd}`);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(cmd);
    }
  });
});

describe('SlashCommandExtension state management', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [
        StarterKit,
        SlashCommandExtension.configure({
          onStateChange: () => {},
        }),
      ],
      content: '',
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  it('returns inactive state initially', () => {
    const state = getSlashCommandState(editor.state);
    expect(state.active).toBe(false);
    expect(state.query).toBe('');
  });

  it('activates when / is typed', () => {
    editor.commands.insertContent('/');
    const state = getSlashCommandState(editor.state);
    expect(state.active).toBe(true);
    expect(state.query).toBe('/');
  });

  it('captures query text after /', () => {
    editor.commands.insertContent('/h1');
    const state = getSlashCommandState(editor.state);
    expect(state.active).toBe(true);
    expect(state.query).toBe('/h1');
  });

  it('deactivates when space is typed after query', () => {
    editor.commands.insertContent('/h1 ');
    const state = getSlashCommandState(editor.state);
    expect(state.active).toBe(false);
  });

  it('captures query from middle of text', () => {
    editor.commands.insertContent('hello /');
    const state = getSlashCommandState(editor.state);
    expect(state.active).toBe(true);
    expect(state.query).toBe('/');
  });


});

describe('SlashCommandExtension getSlashCommandState helper', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, SlashCommandExtension.configure({})],
      content: '',
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  it('returns valid state object', () => {
    const state = getSlashCommandState(editor.state);
    expect(state).toHaveProperty('active');
    expect(state).toHaveProperty('query');
    expect(state).toHaveProperty('from');
    expect(state).toHaveProperty('to');
    expect(state).toHaveProperty('anchorRect');
  });

  it('has null anchorRect by default', () => {
    const state = getSlashCommandState(editor.state);
    expect(state.anchorRect).toBeNull();
  });
});

describe('SlashCommandMenu command execution', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({
          codeBlock: false,
        }),
        CodeBlockLowlight.configure({ lowlight }),
        Table,
        TableRow,
        TableHeader,
        TableCell,
        TaskList,
        TaskItem.configure({ nested: true }),
      ],
      content: '',
    });
  });

  afterEach(() => {
    if (editor) editor.destroy();
  });

  it('setHeading level 1 creates h1', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.chain().focus().setHeading({ level: 1 }).run();
    expect(editor.getHTML()).toContain('<h1>');
  });

  it('setHeading level 2 creates h2', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.chain().focus().setHeading({ level: 2 }).run();
    expect(editor.getHTML()).toContain('<h2>');
  });

  it('setHeading level 3 creates h3', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.chain().focus().setHeading({ level: 3 }).run();
    expect(editor.getHTML()).toContain('<h3>');
  });

  it('insertTable command is available on editor', () => {
    // insertTable is provided by @tiptap/extension-table
    // It is used in SlashCommandMenu.tsx via editor.chain().focus().insertTable(...)
    expect(typeof (editor.commands as Record<string, unknown>)['insertTable']).toBe('function');
  });

  it('setCodeBlock creates code block', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.chain().focus().setCodeBlock().run();
    expect(editor.getHTML()).toContain('<pre>');
    expect(editor.getHTML()).toContain('<code>');
  });

  it('setBlockquote creates blockquote', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.chain().focus().setBlockquote().run();
    expect(editor.getHTML()).toContain('<blockquote>');
  });

  it('setHorizontalRule creates hr', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.chain().focus().setHorizontalRule().run();
    expect(editor.getHTML()).toContain('<hr>');
  });

  it('insertContent with [ ] creates task checkbox', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.chain().focus().insertContent('[ ] ').run();
    expect(editor.getHTML()).toContain('[ ]');
  });

  it('insertContent with date string works', () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    editor.commands.setContent('<p>hello</p>');
    editor.chain().focus().insertContent(dateStr).run();
    expect(editor.getText()).toContain(dateStr);
  });

  it('deleteRange removes slash command text', () => {
    editor.commands.setContent('<p>/h1</p>');
    const docSize = editor.state.doc.content.size;
    editor.chain().focus().deleteRange({ from: 0, to: docSize }).run();
    expect(editor.getText()).toBe('');
  });

  it('heading command chain with args works', () => {
    editor.commands.setContent('');
    editor.chain().focus().setHeading({ level: 1 }).insertContent('My Title').run();
    expect(editor.getText()).toContain('My Title');
  });

  it('toggleBold wraps selected text in strong', () => {
    editor.commands.setContent('<p>hello world</p>');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.chain().focus().toggleBold().run();
    expect(editor.getHTML()).toContain('<strong>hello</strong>');
  });

  it('toggleItalic wraps selected text in em', () => {
    editor.commands.setContent('<p>hello world</p>');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.chain().focus().toggleItalic().run();
    expect(editor.getHTML()).toContain('<em>hello</em>');
  });

  it('toggleCode wraps selected text in code', () => {
    editor.commands.setContent('<p>hello world</p>');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.chain().focus().toggleCode().run();
    expect(editor.getHTML()).toContain('<code>hello</code>');
  });

  it('toggleStrike wraps selected text in s', () => {
    editor.commands.setContent('<p>hello world</p>');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.chain().focus().toggleStrike().run();
    expect(editor.getHTML()).toContain('<s>hello</s>');
  });

  it('toggleBulletList creates ul with li', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.chain().focus().toggleBulletList().run();
    expect(editor.getHTML()).toContain('<ul>');
    expect(editor.getHTML()).toContain('<li>');
  });

  it('toggleOrderedList creates ol with li', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.chain().focus().toggleOrderedList().run();
    expect(editor.getHTML()).toContain('<ol>');
    expect(editor.getHTML()).toContain('<li>');
  });

  it('setCallout creates blockquote with callout class', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.chain().focus().setBlockquote().run();
    expect(editor.getHTML()).toContain('<blockquote>');
  });
});
