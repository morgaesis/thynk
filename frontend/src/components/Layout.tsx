import { Sidebar } from './Sidebar';
import { Editor } from './Editor';

interface Props {
  onEditorSave: (saveFn: () => void) => void;
  onRegisterFocusTitle: (fn: () => void) => void;
}

export function Layout({ onEditorSave, onRegisterFocusTitle }: Props) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <Editor
        onRegisterSave={onEditorSave}
        onRegisterFocusTitle={onRegisterFocusTitle}
      />
    </div>
  );
}
