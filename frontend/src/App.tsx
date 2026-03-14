import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { CommandPalette } from './components/CommandPalette';
import { useUIStore } from './stores/uiStore';

function App() {
  const theme = useUIStore((s) => s.theme);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);

  // Apply theme class to document root
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCommandPalette]);

  return (
    <div className="h-full bg-surface dark:bg-surface-dark">
      <Layout />
      <CommandPalette />
    </div>
  );
}

export default App;
