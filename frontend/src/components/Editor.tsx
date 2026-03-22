import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { VscAdd, VscSearch, VscEdit } from 'react-icons/vsc';
import {
  useEditor,
  EditorContent,
  type Editor as TipTapEditor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { createLowlight, common } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import { useNoteStore } from '../stores/noteStore';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { DictationButton } from './DictationButton';
import { ReadAloudButton } from './ReadAloudButton';
import { UserProfile } from './UserProfile';
import { FileUploadExtension } from '../extensions/FileUploadExtension';
import { useFileUpload } from '../hooks/useFileUpload';
import { useLock } from '../hooks/useLock';
import { useCollaboration } from '../hooks/useCollaboration';
import { useAutoSave } from '../hooks/useAutoSave';
import { contentBuffer } from '../hooks/useContentBuffer';
import { LockIndicator } from './LockIndicator';
import { PresenceIndicator } from './PresenceIndicator';
import { WikiLinkExtension } from '../extensions/WikiLinkExtension';
import { WikiLinkSuggestions } from './WikiLinkSuggestions';
import { MentionSuggestions } from './MentionSuggestions';
import {
  VimModeExtension,
  getVimMode,
  type VimMode,
} from '../extensions/VimModeExtension';
import { VimStatusBar } from './VimStatusBar';
import { TableControls } from './TableControls';
import {
  SlashCommandExtension,
  type SlashCommandState,
} from '../extensions/SlashCommandExtension';
import {
  AiCompletionExtension,
  type AiCompletionState,
} from '../extensions/AiCompletionExtension';
import { SlashCommandMenu } from './SlashCommandMenu';
import { AiCompletionMenu } from './AiCompletionMenu';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

interface Props {
  onRegisterSave?: (saveFn: () => void) => void;
  onRegisterFocusTitle?: (fn: () => void) => void;
}

function getHTML(ed: TipTapEditor): string {
  return ed.getHTML();
}

function setMarkdownContent(ed: TipTapEditor, content: string) {
  if (!content) {
    ed.commands.setContent('', { emitUpdate: false });
    return;
  }

  if (
    content.includes('<p>') ||
    content.includes('<h') ||
    content.includes('<ul>') ||
    content.includes('<ol>')
  ) {
    ed.commands.setContent(content, { emitUpdate: false });
  } else {
    ed.commands.setContent(content, {
      contentType: 'markdown',
    } as Parameters<typeof ed.commands.setContent>[1]);
  }
}

// Plugin key for active node decoration
const activeNodePluginKey = new PluginKey('activeNode');

// Custom extension: decorates the node containing the cursor with data-active="true"
// Used by CSS to show heading prefix markers only on the active heading
const ActiveNodeDecoration = Extension.create({
  name: 'activeNodeDecoration',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: activeNodePluginKey,
        props: {
          decorations(state) {
            const { doc, selection } = state;
            const { $from } = selection;

            // Walk up to the top-level block node containing the cursor
            let depth = $from.depth;
            while (depth > 0 && $from.node(depth).isInline) {
              depth--;
            }
            const node = $from.node(depth);
            const pos = depth === 0 ? 0 : $from.before(depth);

            if (!node || node.type.name === 'doc') {
              return DecorationSet.empty;
            }

            const deco = Decoration.node(pos, pos + node.nodeSize, {
              'data-active': 'true',
            });
            return DecorationSet.create(doc, [deco]);
          },
        },
      }),
    ];
  },
});

// Custom extension: pressing Enter twice at the end of a code block exits it
// (creates a new paragraph below)
const CodeBlockExitOnDoubleEnter = Extension.create({
  name: 'codeBlockExitOnDoubleEnter',

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, empty } = selection;

        if (!empty) return false;
        if ($from.parent.type.name !== 'codeBlock') return false;

        // Get text content of the code block
        const codeContent = $from.parent.textContent;
        const cursorOffset = $from.parentOffset;

        // Check if we're at the very end and the last char is already a newline
        // (meaning user just pressed Enter once at end, leaving an empty last line)
        if (cursorOffset === codeContent.length && codeContent.endsWith('\n')) {
          // User pressed Enter on an empty last line — exit the code block
          // First, delete the trailing newline, then create paragraph after
          return editor
            .chain()
            .deleteRange({ from: $from.pos - 1, to: $from.pos })
            .insertContentAt($from.after($from.depth - 1), {
              type: 'paragraph',
            })
            .focus($from.after($from.depth - 1) + 1)
            .run();
        }

        return false;
      },
    };
  },
});

// Custom extension: decorates all code blocks with their language as data-language
// Used by CSS ::before to show the language tag (e.g. ```typescript)
const CodeBlockLanguageDecoration = Extension.create({
  name: 'codeBlockLanguageDecoration',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('codeBlockLanguage'),
        props: {
          decorations(state) {
            const { doc } = state;
            const decorations: Decoration[] = [];

            doc.forEach((node, offset) => {
              if (node.type.name === 'codeBlock') {
                const lang = node.attrs.language as string | null;
                if (lang) {
                  decorations.push(
                    Decoration.node(offset, offset + node.nodeSize, {
                      'data-language': '```' + lang,
                    }),
                  );
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});

// Custom extension: adds a copy button to code blocks
const CodeBlockCopyButton = Extension.create({
  name: 'codeBlockCopyButton',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('codeBlockCopyButton'),
        props: {
          decorations(state) {
            const { doc } = state;
            const decorations: Decoration[] = [];

            doc.forEach((node, offset) => {
              if (node.type.name === 'codeBlock') {
                decorations.push(
                  Decoration.widget(
                    offset,
                    () => {
                      const button = document.createElement('button');
                      button.className = 'code-block-copy-button';
                      button.type = 'button';
                      button.setAttribute('aria-label', 'Copy code');
                      button.innerHTML =
                        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                      button.dataset.codeBlockPos = String(offset);
                      return button;
                    },
                    {
                      side: -1,
                    },
                  ),
                );
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});

// Custom extension: fix Backspace at the start of a heading
// When cursor is at position 0 inside a heading, convert it to a paragraph
// instead of joining with the previous node (which would delete the newline above).
const HeadingBackspaceFix = Extension.create({
  name: 'headingBackspaceFix',

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, empty } = selection;

        // Only act on collapsed selections
        if (!empty) return false;

        // Check if cursor is at the very start of a heading node
        const node = $from.parent;
        if (!node.type.name.startsWith('heading')) return false;
        if ($from.parentOffset !== 0) return false;

        // Convert heading to paragraph
        return editor.commands.setParagraph();
      },
    };
  },
});

export function Editor({ onRegisterSave, onRegisterFocusTitle }: Props) {
  const activeNote = useNoteStore((s) => s.activeNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const saving = useNoteStore((s) => s.saving);
  const loading = useNoteStore((s) => s.loading);
  const addToast = useUIStore((s) => s.addToast);
  const authUser = useAuthStore((s) => s.user);
  const vimModeEnabled = useSettingsStore((s) => s.vimMode);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const lineHeight = useSettingsStore((s) => s.lineHeight);
  const [vimMode, setVimMode] = useState<VimMode>('normal');
  const [justSaved, setJustSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const activeNoteRef = useRef(activeNote);
  const editorRef = useRef<TipTapEditor | null>(null);
  const { upload } = useFileUpload();
  // Track editor state changes to re-render toolbar
  const [editorVersion, setEditorVersion] = useState(0);

  // User profile panel state
  const [profileUsername, setProfileUsername] = useState<string | null>(null);

  // Wiki-link autocomplete state
  const [wikiSuggest, setWikiSuggest] = useState<{
    query: string;
    anchorRect: DOMRect;
  } | null>(null);

  // @mention autocomplete state
  const [mentionSuggest, setMentionSuggest] = useState<{
    query: string;
    anchorRect: DOMRect;
  } | null>(null);

  // Slash command menu state
  const [slashState, setSlashState] = useState<SlashCommandState>({
    active: false,
    query: '',
    from: 0,
    to: 0,
    anchorRect: null,
  });
  const [aiState, setAiState] = useState<AiCompletionState>({
    active: false,
    prompt: '',
    from: 0,
    to: 0,
    anchorRect: null,
    loading: false,
    suggestions: [],
    selectedIndex: 0,
  });

  const currentUsername = authUser?.username ?? '';
  const {
    locked,
    lockedByMe,
    lockedBy,
    acquireLock: doAcquireLock,
    releaseLock: doReleaseLock,
  } = useLock(activeNote?.id, currentUsername);

  const {
    ydoc,
    provider,
    users: collabUsers,
  } = useCollaboration(activeNote?.id);

  const localUserColor = useMemo(() => {
    if (!provider) return '#958DF1';
    const localState = provider.awareness.getLocalState();
    return localState?.user?.color ?? '#958DF1';
  }, [provider]);

  useEffect(() => {
    activeNoteRef.current = activeNote;
  }, [activeNote]);

  // Editor is read-only when another user holds the lock
  const isReadOnly = locked && !lockedByMe;

  const editor = useEditor({
    editable: !isReadOnly,
    extensions: [
      StarterKit.configure({
        // Disable built-in CodeBlock since we use CodeBlockLowlight
        codeBlock: false,
      }),
      Image,
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Placeholder.configure({
        placeholder: 'Start writing…',
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Markdown,
      ActiveNodeDecoration,
      HeadingBackspaceFix,
      CodeBlockExitOnDoubleEnter,
      CodeBlockLanguageDecoration,
      CodeBlockCopyButton,
      FileUploadExtension.configure({
        onUpload: async (file: File) => {
          try {
            const result = await upload(file);
            return { url: result.url, filename: result.filename };
          } catch (e) {
            const msg = (e as Error).message;
            addToast('error', `Upload failed: ${msg}`);
            return null;
          }
        },
      }),
      WikiLinkExtension.configure({
        onNavigate: async (title: string) => {
          const currentNotes = useNoteStore.getState().notes;
          const n = currentNotes.find((x) => x.title === title);
          if (n) {
            void useNoteStore.getState().openNoteByPath(n.path);
          } else {
            await useNoteStore.getState().createNote(title);
          }
        },
      }),
      SlashCommandExtension.configure({ onStateChange: setSlashState }),
      AiCompletionExtension.configure({ onStateChange: setAiState }),
      ...(vimModeEnabled
        ? [VimModeExtension.configure({ onModeChange: setVimMode })]
        : []),
      ...(ydoc && provider
        ? [
            Collaboration.configure({
              document: ydoc,
            }),
            CollaborationCursor.configure({
              provider,
              user: {
                name: authUser?.username ?? 'Anonymous',
                color: localUserColor,
              },
            }),
          ]
        : []),
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose dark:prose-invert max-w-none focus:outline-none min-h-[300px]',
      },
    },
    onUpdate: ({ editor: e }) => {
      const note = activeNoteRef.current;
      if (!note) return;

      // Save to local buffer immediately (short debounce to avoid excessive writes)
      const currentContent = getHTML(e);
      if (bufferDebounceRef.current) clearTimeout(bufferDebounceRef.current);
      bufferDebounceRef.current = setTimeout(() => {
        contentBuffer.saveBuffer(note.id, currentContent);
      }, 300);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateNote(note.id, { content: currentContent });
      }, 1000);

      // Wiki-link autocomplete: detect [[  trigger
      const { state } = e;
      const { selection } = state;
      const { $from } = selection;
      if (!selection.empty) {
        setWikiSuggest(null);
        setEditorVersion((v) => v + 1);
        return;
      }
      const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
      const triggerMatch = /\[\[([^\][\n]*)$/.exec(textBefore);
      if (triggerMatch) {
        // Get cursor coordinates for positioning the dropdown
        const view = e.view;
        const cursorPos = view.coordsAtPos($from.pos);
        const anchorRect = new DOMRect(
          cursorPos.left,
          cursorPos.top,
          0,
          cursorPos.bottom - cursorPos.top,
        );
        setWikiSuggest({ query: triggerMatch[1], anchorRect });
      } else {
        setWikiSuggest(null);
      }

      // @mention autocomplete: detect @ trigger
      const mentionMatch = /@([a-zA-Z0-9_.[-]]*)$/.exec(textBefore);
      if (mentionMatch) {
        const view = e.view;
        const cursorPos = view.coordsAtPos($from.pos);
        const anchorRect = new DOMRect(
          cursorPos.left,
          cursorPos.top,
          0,
          cursorPos.bottom - cursorPos.top,
        );
        setMentionSuggest({ query: mentionMatch[1], anchorRect });
      } else {
        setMentionSuggest(null);
      }

      setEditorVersion((v) => v + 1);
    },
    onSelectionUpdate: () => {
      setEditorVersion((v) => v + 1);
    },
    onBlur: ({ editor: e }) => {
      const note = activeNoteRef.current;
      if (!note) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (bufferDebounceRef.current) clearTimeout(bufferDebounceRef.current);
      const content = getHTML(e);
      updateNote(note.id, { content });
      contentBuffer.clearBuffer(note.id);
    },
    onTransaction: ({ editor: e }) => {
      if (vimModeEnabled) {
        setVimMode(getVimMode(e.state));
      }
    },
  });

  // Keep editorRef in sync
  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  // Sync editable state when lock changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly);
    }
  }, [editor, isReadOnly]);

  // Reset vim mode to normal when switching notes (deferred to avoid cascading renders)
  useEffect(() => {
    if (!vimModeEnabled) return;
    const id = setTimeout(() => {
      setVimMode('normal');
    }, 0);
    return () => clearTimeout(id);
  }, [activeNote?.id, vimModeEnabled]);

  // Flash green on save complete
  const prevSavingRef = useRef(saving);
  useEffect(() => {
    if (prevSavingRef.current && !saving) {
      const start = setTimeout(() => setJustSaved(true), 0);
      const end = setTimeout(() => setJustSaved(false), 1000);
      return () => {
        clearTimeout(start);
        clearTimeout(end);
      };
    }
    prevSavingRef.current = saving;
  }, [saving]);

  // Sync editor content when active note changes
  useEffect(() => {
    if (editor && activeNote) {
      // Check for unsaved buffer and restore if it has newer content
      const bufferedContent = contentBuffer.getBuffer(activeNote.id);
      const serverContent = activeNote.content || '';

      if (bufferedContent && bufferedContent !== serverContent) {
        // Buffer has unsaved changes - restore from buffer
        setMarkdownContent(editor, bufferedContent);
        addToast('info', 'Restored unsaved changes');
      } else {
        setMarkdownContent(editor, serverContent);
      }

      // Clear the buffer after loading (it's now in the editor)
      contentBuffer.clearBuffer(activeNote.id);
    }
  }, [editor, activeNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save on page unload and visibility change
  useAutoSave(editor);

  const forceSave = useCallback(() => {
    const note = activeNoteRef.current;
    const ed = editorRef.current;
    if (!note || !ed) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (bufferDebounceRef.current) clearTimeout(bufferDebounceRef.current);
    const content = getHTML(ed);
    updateNote(note.id, { content });
    contentBuffer.clearBuffer(note.id);
    if (titleRef.current) {
      const newTitle = titleRef.current.value.trim();
      if (newTitle && newTitle !== note.title) {
        updateNote(note.id, { title: newTitle });
      }
    }
  }, [updateNote]);

  // Register save function with parent so Ctrl+S can trigger it
  useEffect(() => {
    if (onRegisterSave) {
      onRegisterSave(forceSave);
    }
  }, [onRegisterSave, forceSave]);

  // Register focusTitle function with parent so F2 can trigger it
  useEffect(() => {
    onRegisterFocusTitle?.(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });
  }, [onRegisterFocusTitle]);

  const handleTitleBlur = useCallback(() => {
    const note = activeNoteRef.current;
    if (!note || !titleRef.current) return;
    const newTitle = titleRef.current.value.trim();
    if (newTitle && newTitle !== note.title) {
      updateNote(note.id, { title: newTitle });
    }
  }, [updateNote]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        editor?.commands.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
        editor?.commands.focus();
      }
    },
    [editor],
  );

  const handleEditorClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const copyButton = target.closest('.code-block-copy-button');
      if (copyButton && editor) {
        const posStr = copyButton.getAttribute('data-code-block-pos');
        if (posStr) {
          const pos = parseInt(posStr, 10);
          let codeContent = '';
          editor.state.doc.forEach((node, offset) => {
            if (node.type.name === 'codeBlock' && offset === pos) {
              codeContent = node.textContent;
            }
          });
          if (codeContent) {
            navigator.clipboard.writeText(codeContent).then(() => {
              addToast('success', 'Code copied to clipboard');
              copyButton.classList.add('copied');
              setTimeout(() => {
                copyButton.classList.remove('copied');
              }, 2000);
            });
          }
        }
      }
    },
    [editor, addToast],
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (bufferDebounceRef.current) clearTimeout(bufferDebounceRef.current);
    };
  }, []);

  // Wiki-link suggestion select: replace [[<query> with [[<title>]]
  const handleWikiSelect = useCallback(
    (title: string) => {
      if (!editor || !wikiSuggest) return;
      const { state } = editor;
      const { $from } = state.selection;
      const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
      const triggerMatch = /\[\[([^\][\n]*)$/.exec(textBefore);
      if (!triggerMatch) return;
      const from = $from.pos - triggerMatch[0].length;
      const to = $from.pos;
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent(`[[${title}]]`)
        .run();
      setWikiSuggest(null);
    },
    [editor, wikiSuggest],
  );

  // @mention suggestion select: replace @<query> with @<username>
  const handleMentionSelect = useCallback(
    (username: string) => {
      if (!editor || !mentionSuggest) return;
      const { state } = editor;
      const { $from } = state.selection;
      const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
      const triggerMatch = /@([a-zA-Z0-9_.[-]]*)$/.exec(textBefore);
      if (!triggerMatch) return;
      const from = $from.pos - triggerMatch[0].length;
      const to = $from.pos;
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent(`@${username} `)
        .run();
      setMentionSuggest(null);
    },
    [editor, mentionSuggest],
  );

  if (loading && !activeNote) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface dark:bg-surface-dark">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-text-muted dark:text-text-muted-dark">
            Loading note…
          </p>
        </div>
      </div>
    );
  }

  if (!activeNote) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface dark:bg-surface-dark">
        <div className="text-center max-w-sm">
          <div className="mb-4 flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-border dark:bg-border-dark flex items-center justify-center">
              <VscEdit
                size={28}
                className="text-text-muted dark:text-text-muted-dark"
              />
            </div>
          </div>
          <p className="text-lg font-medium text-text dark:text-text-dark mb-1">
            Welcome to Thynk
          </p>
          <p className="text-sm text-text-muted dark:text-text-muted-dark mb-6">
            Your thoughts, organized. Pick a note or start fresh.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                const title = `Untitled ${new Date().toISOString().slice(0, 10)}`;
                useNoteStore.getState().createNote(title);
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg
                         bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              <VscAdd size={14} />
              New Note
            </button>
            <button
              onClick={() => useUIStore.getState().toggleCommandPalette()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg
                         bg-border dark:bg-border-dark text-text dark:text-text-dark
                         hover:bg-border-dark dark:hover:bg-border transition-colors"
            >
              <VscSearch size={14} />
              Search
            </button>
          </div>
          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-text-muted dark:text-text-muted-dark">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-border dark:bg-border-dark text-[10px]">
                Ctrl+K
              </kbd>{' '}
              Search
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-border dark:bg-border-dark text-[10px]">
                Ctrl+B
              </kbd>{' '}
              Sidebar
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col bg-surface dark:bg-surface-dark min-h-0"
      style={
        {
          '--editor-font-size': `${fontSize}px`,
          '--editor-line-height': String(lineHeight),
        } as React.CSSProperties
      }
    >
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Table controls toolbar — shown when cursor is inside a table */}
        {editor && <TableControls editor={editor} key={editorVersion} />}

        <div className="max-w-3xl mx-auto w-full px-8 py-10 flex-1">
          {/* Title */}
          <input
            ref={titleRef}
            key={activeNote.id}
            defaultValue={activeNote.title}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            className="w-full text-3xl font-bold bg-transparent border-none outline-none
                     text-text dark:text-text-dark placeholder:text-text-muted
                     dark:placeholder:text-text-muted-dark mb-6"
            placeholder="Untitled"
          />

          {/* Status bar */}
          <div className="flex items-center gap-3 mb-4 text-xs text-text-muted dark:text-text-muted-dark">
            {saving ? (
              <span>Saving…</span>
            ) : (
              <span
                className={`transition-colors duration-300 ${justSaved ? 'text-green-500' : ''}`}
              >
                Saved
              </span>
            )}
            <span>·</span>
            <span className="tabular-nums">
              {new Date(activeNote.updated_at).toLocaleString()}
            </span>
            <span>·</span>
            <span className="tabular-nums">
              {(() => {
                const text = editor?.getText() ?? '';
                const words = text.trim() ? text.trim().split(/\s+/).length : 0;
                const chars = text.length;
                const readMin = Math.max(1, Math.ceil(words / 200));
                return `${words} words · ${chars} chars · ${readMin} min read`;
              })()}
            </span>
            {activeNote.last_updated_by && (
              <>
                <span>·</span>
                <span>
                  Last edited by{' '}
                  <button
                    onClick={() =>
                      setProfileUsername(activeNote.last_updated_by!)
                    }
                    className="underline hover:text-text dark:hover:text-text-dark transition-colors"
                  >
                    {activeNote.last_updated_by}
                  </button>
                </span>
              </>
            )}
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(activeNote.path);
                  addToast('success', 'Path copied');
                }}
                title="Click to copy path"
                className="font-mono text-text-muted dark:text-text-muted-dark hover:text-text dark:hover:text-text-dark transition-colors truncate max-w-[200px]"
              >
                {activeNote.path}
              </button>
              <PresenceIndicator users={collabUsers} />
              <LockIndicator
                locked={locked}
                lockedByMe={lockedByMe}
                lockedBy={lockedBy}
                onAcquire={doAcquireLock}
                onRelease={doReleaseLock}
              />
              <DictationButton editor={editor} />
              <ReadAloudButton editor={editor} />
            </span>
          </div>
          {locked && !lockedByMe && (
            <div className="mb-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
              This note is locked by <strong>{lockedBy}</strong> and is
              read-only.
            </div>
          )}

          {/* Editor */}
          <div
            className={
              vimModeEnabled && vimMode === 'normal' ? 'vim-normal-mode' : ''
            }
            onClick={handleEditorClick}
          >
            <EditorContent
              editor={editor}
              className="text-text dark:text-text-dark"
            />
          </div>
        </div>
      </div>
      {/* end scrollable area */}

      {/* Vim mode status bar — outside scroll container so it stays at bottom */}
      {vimModeEnabled && <VimStatusBar mode={vimMode} />}

      {/* Wiki-link autocomplete dropdown */}
      {wikiSuggest &&
        createPortal(
          <WikiLinkSuggestions
            query={wikiSuggest.query}
            onSelect={handleWikiSelect}
            onClose={() => setWikiSuggest(null)}
            anchorRect={wikiSuggest.anchorRect}
          />,
          document.body,
        )}

      {/* @mention autocomplete dropdown */}
      {mentionSuggest &&
        createPortal(
          <MentionSuggestions
            query={mentionSuggest.query}
            onSelect={handleMentionSelect}
            onClose={() => setMentionSuggest(null)}
            anchorRect={mentionSuggest.anchorRect}
          />,
          document.body,
        )}

      {/* Slash command menu */}
      {editor &&
        slashState.active &&
        createPortal(
          <SlashCommandMenu
            slashState={slashState}
            editor={editor}
            onClose={() => setSlashState((s) => ({ ...s, active: false }))}
          />,
          document.body,
        )}

      {/* AI completion menu */}
      {editor &&
        aiState.active &&
        aiState.anchorRect &&
        createPortal(
          <AiCompletionMenu
            anchorRect={aiState.anchorRect}
            onSelect={(completion) => {
              // Insert the completion after the ::ai trigger
              editor
                .chain()
                .deleteRange({ from: aiState.from, to: aiState.to })
                .insertContent(completion + ' ')
                .focus()
                .run();
              setAiState((s) => ({ ...s, active: false, suggestions: [] }));
            }}
            onClose={() =>
              setAiState((s) => ({ ...s, active: false, suggestions: [] }))
            }
          />,
          document.body,
        )}

      {/* User profile panel */}
      {profileUsername &&
        createPortal(
          <UserProfile
            username={profileUsername}
            onClose={() => setProfileUsername(null)}
          />,
          document.body,
        )}
    </div>
  );
}
