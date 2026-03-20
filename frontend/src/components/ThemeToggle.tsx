import { VscColorMode } from 'react-icons/vsc';
import { useUIStore, THEMES } from '../stores/uiStore';

export function ThemeToggle() {
  const setTheme = useUIStore((s) => s.setTheme);
  const theme = useUIStore((s) => s.theme);

  function cycleTheme() {
    const idx = THEMES.findIndex((t) => t.value === theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next.value);
  }

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-md text-text-muted dark:text-text-muted-dark
                 hover:bg-border dark:hover:bg-border-dark transition-colors"
      title={`Theme: ${theme}. Click to cycle.`}
    >
      <VscColorMode size={18} />
    </button>
  );
}
