import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';

(globalThis as Record<string, unknown>).__GIT_HASH__ = 'test-hash';
(globalThis as Record<string, unknown>).__APP_VERSION__ = '0.1.0';

import { SettingsPage } from '../components/SettingsPage';

const mockState = {
  theme: 'dark' as string,
  setTheme: vi.fn(),
};

vi.mock('../stores/uiStore', () => ({
  useUIStore: vi.fn((selector) => {
    return selector ? selector(mockState) : mockState;
  }),
  THEMES: [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'catppuccin', label: 'Catppuccin' },
    { value: 'nord', label: 'Nord' },
    { value: 'dracula', label: 'Dracula' },
    { value: 'solarized-light', label: 'Solarized Light' },
    { value: 'solarized-dark', label: 'Solarized Dark' },
    { value: 'nord-light', label: 'Nord Light' },
  ],
}));

vi.mock('../stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector) => {
    const state = {
      fontSize: 16,
      lineHeight: 1.5,
      vimMode: false,
      spellCheck: false,
      shortcuts: {},
      aiProvider: 'openai' as const,
      aiApiKey: '',
      aiModel: 'gpt-4o-mini',
      setFontSize: vi.fn(),
      setLineHeight: vi.fn(),
      setVimMode: vi.fn(),
      setSpellCheck: vi.fn(),
      setShortcut: vi.fn(),
      resetShortcut: vi.fn(),
      setAiProvider: vi.fn(),
      setAiApiKey: vi.fn(),
      setAiModel: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
  DEFAULT_SHORTCUTS: {},
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = {
      user: { id: '1', username: 'test', display_name: 'Test User', role: 'admin' as const },
      checkSession: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../api', () => ({
  exportWorkspace: vi.fn(),
  listInvitations: vi.fn().mockResolvedValue([]),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  listAiModels: vi.fn().mockResolvedValue([]),
}));

let pushStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockState.theme = 'dark';
  mockState.setTheme = vi.fn();
  pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
});

afterEach(() => {
  pushStateSpy.mockRestore();
  cleanup();
});

describe('Theme selection', () => {
  it('shows more than 2 theme options in settings', async () => {
    await act(async () => {
      render(<SettingsPage onClose={vi.fn()} />);
    });

    const themeSection = screen.getByText(/color theme/i).closest('section');
    const themeButtons = themeSection!.querySelectorAll('button');

    expect(themeButtons.length).toBeGreaterThanOrEqual(4);
  });

  it('calls setTheme when Catppuccin theme button is clicked', async () => {
    await act(async () => {
      render(<SettingsPage onClose={vi.fn()} />);
    });

    const themeButtons = screen.getAllByRole('button');
    const catppuccinBtn = themeButtons.find(b => b.textContent?.toLowerCase().includes('catppuccin'));

    expect(catppuccinBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(catppuccinBtn!);
    });

    expect(mockState.setTheme).toHaveBeenCalledWith('catppuccin');
  });

  it('calls setTheme when Nord theme button is clicked', async () => {
    await act(async () => {
      render(<SettingsPage onClose={vi.fn()} />);
    });

    const themeButtons = screen.getAllByRole('button');
    const nordBtn = themeButtons.find(b => b.textContent?.toLowerCase().includes('nord'));

    expect(nordBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(nordBtn!);
    });

    expect(mockState.setTheme).toHaveBeenCalledWith('nord');
  });

  it('calls setTheme when Light theme button is clicked', async () => {
    await act(async () => {
      render(<SettingsPage onClose={vi.fn()} />);
    });

    const themeButtons = screen.getAllByRole('button');
    const lightBtn = themeButtons.find(b => b.textContent?.toLowerCase().includes('light'));

    expect(lightBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(lightBtn!);
    });

    expect(mockState.setTheme).toHaveBeenCalledWith('light');
  });

  it('highlights the currently selected theme', async () => {
    mockState.theme = 'catppuccin';

    await act(async () => {
      render(<SettingsPage onClose={vi.fn()} />);
    });

    const themeButtons = Array.from(screen.getAllByRole('button')) as HTMLButtonElement[];
    const catppuccinBtn = themeButtons.find(b => b.textContent?.toLowerCase().includes('catppuccin'));

    expect(catppuccinBtn).toBeTruthy();
    expect(catppuccinBtn!.className).toContain('bg-accent');
  });
});
