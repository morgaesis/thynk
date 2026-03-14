import { Sidebar } from './Sidebar';
import { Editor } from './Editor';

interface Props {
  onEditorSave: (saveFn: () => void) => void;
}

export function Layout({ onEditorSave }: Props) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <Editor onRegisterSave={onEditorSave} />
    </div>
  );
}
