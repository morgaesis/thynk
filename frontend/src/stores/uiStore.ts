import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'catppuccin' | 'nord' | 'dracula' | 'solarized-light' | 'solarized-dark' | 'nord-light';

export const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'catppuccin', label: 'Catppuccin' },
  { value: 'nord', label: 'Nord' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'solarized-light', label: 'Solarized Light' },
  { value: 'solarized-dark', label: 'Solarized Dark' },
  { value: 'nord-light', label: 'Nord Light' },
];

const VALID_THEMES = new Set(THEMES.map(t => t.value));

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface UIStore {
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  showGraph: boolean;
  theme: Theme;
  toasts: Toast[];
  recentNoteIds: string[];
  settingsOpen: boolean;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setShowGraph: (show: boolean) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  addToast: (type: Toast['type'], message: string) => void;
  removeToast: (id: string) => void;
  addRecentNote: (id: string) => void;
  setSettingsOpen: (open: boolean) => void;
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('thynk-theme');
  if (stored && VALID_THEMES.has(stored as Theme)) return stored as Theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  commandPaletteOpen: false,
  showGraph: false,
  theme: getInitialTheme(),
  toasts: [],
  recentNoteIds: [],
  settingsOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setShowGraph: (show) => set({ showGraph: show }),
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setTheme: (theme) => {
    localStorage.setItem('thynk-theme', theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('thynk-theme', next);
      return { theme: next };
    }),
  addToast: (type, message) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        { id: `${Date.now()}-${Math.random()}`, type, message },
      ],
    })),
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  addRecentNote: (id) =>
    set((s) => {
      const filtered = s.recentNoteIds.filter((r) => r !== id);
      return { recentNoteIds: [id, ...filtered].slice(0, 10) };
    }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
}));
