import type { Editor as TipTapEditor } from '@tiptap/react';

interface Props {
  editor: TipTapEditor;
}

export function TableControls({ editor }: Props) {
  const isInTable = editor.isActive('table');
  if (!isInTable) return null;

  return (
    <div
      className="flex items-center gap-1 px-3 py-1.5 border-b border-border dark:border-border-dark
                    bg-sidebar dark:bg-sidebar-dark text-xs flex-wrap"
    >
      <span className="text-text-muted dark:text-text-muted-dark mr-1 font-medium">
        Table:
      </span>
      <button
        onClick={() => editor.chain().focus().addRowAfter().run()}
        className="px-2 py-0.5 rounded hover:bg-border dark:hover:bg-border-dark
                   text-text dark:text-text-dark transition-colors"
        title="Add row below"
      >
        + Row
      </button>
      <button
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        className="px-2 py-0.5 rounded hover:bg-border dark:hover:bg-border-dark
                   text-text dark:text-text-dark transition-colors"
        title="Add column after"
      >
        + Col
      </button>
      <span className="text-border dark:text-border-dark">|</span>
      <button
        onClick={() => editor.chain().focus().deleteRow().run()}
        className="px-2 py-0.5 rounded hover:bg-red-500/10 dark:hover:bg-red-500/10
                   text-text-muted dark:text-text-muted-dark hover:text-red-500 transition-colors"
        title="Delete current row"
      >
        - Row
      </button>
      <button
        onClick={() => editor.chain().focus().deleteColumn().run()}
        className="px-2 py-0.5 rounded hover:bg-red-500/10 dark:hover:bg-red-500/10
                   text-text-muted dark:text-text-muted-dark hover:text-red-500 transition-colors"
        title="Delete current column"
      >
        - Col
      </button>
      <span className="text-border dark:text-border-dark">|</span>
      <button
        onClick={() => editor.chain().focus().deleteTable().run()}
        className="px-2 py-0.5 rounded hover:bg-red-500/10 dark:hover:bg-red-500/10
                   text-text-muted dark:text-text-muted-dark hover:text-red-500 transition-colors"
        title="Delete table"
      >
        Delete Table
      </button>
      <span className="text-border dark:text-border-dark">|</span>
      <button
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        className="px-2 py-0.5 rounded hover:bg-border dark:hover:bg-border-dark
                   text-text dark:text-text-dark transition-colors"
        title="Toggle header row"
      >
        Header Row
      </button>
    </div>
  );
}
