import { create } from 'zustand';

export type FontSize = 'sm' | 'md' | 'lg';
export type LineHeight = 'compact' | 'normal' | 'relaxed';

export interface SettingsStore {
  fontSize: FontSize;
  vimMode: boolean;
  lineHeight: LineHeight;
  spellCheck: boolean;
  setFontSize: (size: FontSize) => void;
  setVimMode: (enabled: boolean) => void;
  setLineHeight: (lh: LineHeight) => void;
  setSpellCheck: (enabled: boolean) => void;
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
  fontSize: getStored<FontSize>('thynk-font-size', 'md'),
  vimMode: getStored<boolean>('thynk-vim-mode', false),
  lineHeight: getStored<LineHeight>('thynk-line-height', 'normal'),
  spellCheck: getStored<boolean>('thynk-spell-check', true),

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
}));
