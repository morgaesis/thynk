import { VscColorMode } from 'react-icons/vsc';
import { useUIStore } from '../stores/uiStore';

export function ThemeToggle() {
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const theme = useUIStore((s) => s.theme);

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-md text-text-muted dark:text-text-muted-dark
                 hover:bg-border dark:hover:bg-border-dark transition-colors"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <VscColorMode size={18} />
    </button>
  );
}
