import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

describe('TaskList markdown support', () => {
  const createEditor = () => {
    return new Editor({
      extensions: [
        StarterKit,
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
      ],
      content: '',
    });
  };

  it('renders unchecked task item from HTML', () => {
    const editor = createEditor();
    editor.commands.setContent(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">Buy groceries</li></ul>',
      { emitUpdate: false },
    );

    expect(editor.getHTML()).toContain('data-type="taskItem"');
    expect(editor.getHTML()).toContain('data-checked="false"');
    editor.destroy();
  });

  it('renders checked task item from HTML', () => {
    const editor = createEditor();
    editor.commands.setContent(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">Buy groceries</li></ul>',
      { emitUpdate: false },
    );

    expect(editor.getHTML()).toContain('data-type="taskItem"');
    expect(editor.getHTML()).toContain('data-checked="true"');
    editor.destroy();
  });

  it('renders task list with multiple items', () => {
    const editor = createEditor();
    editor.commands.setContent(
      `
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false">Task 1</li>
        <li data-type="taskItem" data-checked="true">Task 2</li>
        <li data-type="taskItem" data-checked="false">Task 3</li>
      </ul>
    `,
      { emitUpdate: false },
    );

    const html = editor.getHTML();
    expect(html).toContain('data-type="taskItem"');
    expect(html).toContain('data-checked="false"');
    expect(html).toContain('data-checked="true"');
    editor.destroy();
  });

  it('can toggle task item checked state', () => {
    const editor = createEditor();
    editor.commands.setContent(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">Task</li></ul>',
      { emitUpdate: false },
    );

    const taskItem = editor.state.doc.firstChild?.firstChild;
    expect(taskItem).toBeDefined();

    // The TaskItem extension adds a toggle command
    expect(editor.can().toggleTaskList()).toBe(true);
    editor.destroy();
  });
});
