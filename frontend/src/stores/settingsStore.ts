import { create } from 'zustand';

export type FontSize = number; // pixels, e.g. 14, 16, 18
export type LineHeight = number; // e.g. 1.4, 1.6, 1.8

export interface ShortcutAction {
  label: string;
  defaultKey: string;
}

export const DEFAULT_SHORTCUTS: Record<string, ShortcutAction> = {
  'command-palette': { label: 'Command palette / Search', defaultKey: 'Ctrl+K' },
  'new-note': { label: 'New note', defaultKey: 'Ctrl+Shift+N' },
  'save': { label: 'Save', defaultKey: 'Ctrl+S' },
  'focus-title': { label: 'Focus title', defaultKey: 'F2' },
};

export interface SettingsStore {
  fontSize: FontSize;
  vimMode: boolean;
  lineHeight: LineHeight;
  spellCheck: boolean;
  shortcuts: Record<string, string>; // action -> key binding
  setFontSize: (size: FontSize) => void;
  setVimMode: (enabled: boolean) => void;
  setLineHeight: (lh: LineHeight) => void;
  setSpellCheck: (enabled: boolean) => void;
  setShortcut: (action: string, key: string) => void;
  resetShortcut: (action: string) => void;
}

function migrateSize(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v === 'sm') return 14;
  if (v === 'lg') return 18;
  return 16; // 'md' or fallback
}

function migrateLineHeight(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v === 'compact') return 1.4;
  if (v === 'relaxed') return 1.8;
  return 1.6;
}

function getStored<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function persist<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  fontSize: migrateSize(getStored<unknown>('thynk-font-size', 16)),
  vimMode: getStored<boolean>('thynk-vim-mode', false),
  lineHeight: migrateLineHeight(getStored<unknown>('thynk-line-height', 1.6)),
  spellCheck: getStored<boolean>('thynk-spell-check', true),
  shortcuts: getStored<Record<string, string>>('thynk-shortcuts', {}),

  setFontSize: (size) => {
    persist('thynk-font-size', size);
    set({ fontSize: size });
  },
  setVimMode: (enabled) => {
    persist('thynk-vim-mode', enabled);
    set({ vimMode: enabled });
  },
  setLineHeight: (lh) => {
    persist('thynk-line-height', lh);
    set({ lineHeight: lh });
  },
  setSpellCheck: (enabled) => {
    persist('thynk-spell-check', enabled);
    set({ spellCheck: enabled });
  },
  setShortcut: (action, key) => {
    set((s) => {
      const next = { ...s.shortcuts, [action]: key };
      persist('thynk-shortcuts', next);
      return { shortcuts: next };
    });
  },
  resetShortcut: (action) => {
    set((s) => {
      const next = { ...s.shortcuts };
      delete next[action];
      persist('thynk-shortcuts', next);
      return { shortcuts: next };
    });
  },
}));
