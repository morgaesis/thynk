import { create } from 'zustand';

type Theme = 'light' | 'dark';

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
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('thynk-theme');
  if (stored === 'light' || stored === 'dark') return stored;
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
}));
