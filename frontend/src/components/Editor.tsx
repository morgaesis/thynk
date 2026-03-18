import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
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

function getMarkdown(ed: TipTapEditor): string {
  return (ed.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
}

function setMarkdownContent(ed: TipTapEditor, markdown: string) {
  ed.commands.setContent(markdown || '', { 
    contentType: 'markdown' 
  } as Parameters<typeof ed.commands.setContent>[1]);
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
  const addToast = useUIStore((s) => s.addToast);
  const authUser = useAuthStore((s) => s.user);
  const vimModeEnabled = useSettingsStore((s) => s.vimMode);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const lineHeight = useSettingsStore((s) => s.lineHeight);
  const [vimMode, setVimMode] = useState<VimMode>('normal');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateNote(note.id, { content: getMarkdown(e) });
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
      updateNote(note.id, { content: getMarkdown(e) });
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

  // Sync editor content when active note changes
  useEffect(() => {
    if (editor && activeNote) {
      setMarkdownContent(editor, activeNote.content || '');
    }
  }, [editor, activeNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const forceSave = useCallback(() => {
    const note = activeNoteRef.current;
    const ed = editorRef.current;
    if (!note || !ed) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updateNote(note.id, { content: getMarkdown(ed) });
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
      if (e.key === 'Enter') {
        e.preventDefault();
        editor?.commands.focus();
      }
    },
    [editor],
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
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

  if (!activeNote) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface dark:bg-surface-dark">
        <div className="text-center">
          <p className="text-lg text-text-muted dark:text-text-muted-dark">
            Select a note or create a new one
          </p>
          <p className="text-sm text-text-muted dark:text-text-muted-dark mt-2">
            Press{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-border dark:bg-border-dark text-xs">
              Ctrl+Shift+N
            </kbd>{' '}
            to create a note or{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-border dark:bg-border-dark text-xs">
              Ctrl+K
            </kbd>{' '}
            to search
          </p>
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
            {saving ? <span>Saving…</span> : <span>Saved</span>}
            <span>·</span>
            <span className="tabular-nums">
              {new Date(activeNote.updated_at).toLocaleString()}
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
