import { Sidebar } from './Sidebar';
import { Editor } from './Editor';
import { GraphView } from './GraphView';
import { useUIStore } from '../stores/uiStore';

interface Props {
  onEditorSave: (saveFn: () => void) => void;
  onRegisterFocusTitle: (fn: () => void) => void;
  showGraph?: boolean;
}

export function Layout({ onEditorSave, onRegisterFocusTitle }: Props) {
  const showGraph = useUIStore((s) => s.showGraph);
  return (
    <div className="flex h-full">
      <Sidebar />
      {showGraph ? (
        <div className="flex-1 min-w-0">
          <GraphView />
        </div>
      ) : (
        <Editor
          onRegisterSave={onEditorSave}
          onRegisterFocusTitle={onRegisterFocusTitle}
        />
      )}
    </div>
  );
}
