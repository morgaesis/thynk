import { Sidebar } from './Sidebar';
import { Editor } from './Editor';

export function Layout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <Editor />
    </div>
  );
}
