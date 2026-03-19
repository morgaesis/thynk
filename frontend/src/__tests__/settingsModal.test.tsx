import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';

(globalThis as Record<string, unknown>).__GIT_HASH__ = 'test-hash';

import { SettingsPage } from '../components/SettingsPage';

vi.mock('../stores/uiStore', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      theme: 'dark' as const,
      setTheme: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
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
}));

let pushStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
});

afterEach(() => {
  pushStateSpy.mockRestore();
  cleanup();
});

describe('SettingsPage modal behavior', () => {
  it('does NOT navigate to /settings URL when opening', async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(<SettingsPage onClose={onClose} />);
    });
    expect(pushStateSpy).not.toHaveBeenCalledWith({}, '', '/settings');
  });

  it('shows close button (X) in header when rendered as modal', async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(<SettingsPage onClose={onClose} />);
    });
    const closeButton = screen.getByTitle('Close');
    expect(closeButton).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(<SettingsPage onClose={onClose} />);
    });
    const closeButton = screen.getByTitle('Close');
    await act(async () => {
      fireEvent.click(closeButton);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when pressing Escape key', async () => {
    const onClose = vi.fn();
    const addListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');

    await act(async () => {
      render(<SettingsPage onClose={onClose} />);
    });

    const keyDownListeners = addListenerSpy.mock.calls.filter(([event]) => event === 'keydown');
    expect(keyDownListeners.length).toBeGreaterThanOrEqual(1);

    for (const [, handler] of keyDownListeners) {
      await act(async () => {
        (handler as EventListener)(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
    }

    removeListenerSpy.mockRestore();
    addListenerSpy.mockRestore();
    expect(onClose).toHaveBeenCalled();
  });
});
