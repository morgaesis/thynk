import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor as TipTapEditor } from '@tiptap/react';
import type { SlashCommandState } from '../extensions/SlashCommandExtension';

interface CommandDef {
  trigger: string;
  label: string;
  description: string;
}

const COMMANDS: CommandDef[] = [
  { trigger: '/table', label: 'Table', description: '/table [rows] [cols] — insert table' },
  { trigger: '/h1', label: 'Heading 1', description: '/h1 [text] — large heading' },
  { trigger: '/h2', label: 'Heading 2', description: '/h2 [text] — medium heading' },
  { trigger: '/h3', label: 'Heading 3', description: '/h3 [text] — small heading' },
  { trigger: '/code', label: 'Code block', description: '/code [lang] — code block' },
  { trigger: '/quote', label: 'Blockquote', description: '/quote — blockquote' },
  { trigger: '/divider', label: 'Divider', description: '/divider or /hr — horizontal rule' },
  { trigger: '/hr', label: 'Horizontal rule', description: '/hr — horizontal rule' },
  { trigger: '/todo', label: 'Todo item', description: '/todo — checkbox task item' },
  { trigger: '/date', label: 'Date', description: "/date — insert today's date" },
  { trigger: '/bold', label: 'Bold', description: '/bold — bold text' },
  { trigger: '/italic', label: 'Italic', description: '/italic — italic text' },
  { trigger: '/inline-code', label: 'Inline code', description: '/inline-code — inline code' },
  { trigger: '/strikethrough', label: 'Strikethrough', description: '/strikethrough — strikethrough text' },
  { trigger: '/bullet', label: 'Bullet list', description: '/bullet — bullet list' },
  { trigger: '/numbered', label: 'Numbered list', description: '/numbered — numbered list' },
  { trigger: '/callout', label: 'Callout', description: '/callout — callout blockquote' },
  { trigger: '/image', label: 'Image', description: '/image [url] — insert image' },
];

interface Props {
  slashState: SlashCommandState;
  editor: TipTapEditor;
  onClose: () => void;
}

function executeCommand(editor: TipTapEditor, slashState: SlashCommandState, trigger: string) {
  const { from, to, query } = slashState;
  const parts = query.trim().split(/\s+/);
  const args = parts.slice(1);

  // Delete the slash command text
  editor.chain().focus().deleteRange({ from, to }).run();

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  switch (trigger) {
    case '/table': {
      const rows = parseInt(args[0] ?? '3', 10) || 3;
      const cols = parseInt(args[1] ?? '3', 10) || 3;
      editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
      break;
    }
    case '/h1':
      editor.chain().focus().setHeading({ level: 1 }).insertContent(args.join(' ') || '').run();
      break;
    case '/h2':
      editor.chain().focus().setHeading({ level: 2 }).insertContent(args.join(' ') || '').run();
      break;
    case '/h3':
      editor.chain().focus().setHeading({ level: 3 }).insertContent(args.join(' ') || '').run();
      break;
    case '/code':
      editor.chain().focus().setCodeBlock({ language: args[0] ?? '' }).run();
      break;
    case '/quote':
      editor.chain().focus().setBlockquote().run();
      break;
    case '/divider':
    case '/hr':
      editor.chain().focus().setHorizontalRule().run();
      break;
    case '/todo':
      editor.chain().focus().insertContent('[ ] ').run();
      break;
    case '/date':
      editor.chain().focus().insertContent(dateStr).run();
      break;
    case '/bold':
      editor.chain().focus().toggleBold().run();
      break;
    case '/italic':
      editor.chain().focus().toggleItalic().run();
      break;
    case '/inline-code':
      editor.chain().focus().toggleCode().run();
      break;
    case '/strikethrough':
      editor.chain().focus().toggleStrike().run();
      break;
    case '/bullet':
      editor.chain().focus().toggleBulletList().run();
      break;
    case '/numbered':
      editor.chain().focus().toggleOrderedList().run();
      break;
    case '/callout':
      editor.chain().focus().setBlockquote().run();
      break;
    case '/image':
      if (args[0]) {
        editor.chain().focus().setImage({ src: args[0] }).run();
      } else {
        const url = window.prompt('Enter image URL:');
        if (url) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      }
      break;
  }
}

export function SlashCommandMenu({ slashState, editor, onClose }: Props) {
  const [selected, setSelected] = useState(0);

  const query = slashState.query.toLowerCase();
  const filtered = COMMANDS.filter(
    (c) => c.trigger.startsWith(query) || c.label.toLowerCase().includes(query.slice(1)),
  );

  // Clamp to valid range — handles query changes shrinking the filtered list
  const safeSelected = filtered.length > 0 ? Math.min(selected, filtered.length - 1) : 0;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!slashState.active) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => (s + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => (s - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const cmd = filtered[safeSelected];
        if (cmd) { executeCommand(editor, slashState, cmd.trigger); onClose(); }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [slashState, editor, onClose, filtered, safeSelected]);

  if (!slashState.active || filtered.length === 0 || !slashState.anchorRect) return null;

  const rect = slashState.anchorRect;
  const top = rect.bottom + window.scrollY + 4;
  const left = rect.left + window.scrollX;

  return createPortal(
    <div
      style={{ position: 'fixed', top, left, zIndex: 9999, minWidth: '240px' }}
      className="bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                 rounded-lg shadow-xl overflow-hidden"
    >
      {filtered.map((cmd, i) => (
        <button
          key={cmd.trigger}
          onClick={() => { executeCommand(editor, slashState, cmd.trigger); onClose(); }}
          className={`w-full text-left px-3 py-2 text-sm transition-colors
            ${i === safeSelected ? 'bg-accent/10 text-accent' : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'}`}
        >
          <span className="font-medium">{cmd.label}</span>
          <span className="ml-2 text-xs text-text-muted dark:text-text-muted-dark">{cmd.description}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
