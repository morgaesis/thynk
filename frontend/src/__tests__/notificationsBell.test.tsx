import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';

import { NotificationsBell } from '../components/NotificationsBell';

vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = {
      user: { id: '1', username: 'testuser', display_name: 'Test User', role: 'admin' as const },
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../api', () => ({
  getNotifications: vi.fn().mockResolvedValue([
    { id: '1', message: 'You were mentioned', notePath: 'test.md', read: false, created_at: '' },
    { id: '2', message: 'Welcome', notePath: 'welcome.md', read: true, created_at: '' },
  ]),
  markNotificationRead: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('NotificationsBell', () => {
  it('shows bell icon in sidebar header', async () => {
    await act(async () => {
      render(<NotificationsBell />);
    });
    const bell = screen.getByTitle('Notifications');
    expect(bell).toBeInTheDocument();
  });

  it('shows unread badge when there are unread notifications', async () => {
    await act(async () => {
      render(<NotificationsBell />);
    });
    const badge = screen.getByText('1');
    expect(badge).toBeInTheDocument();
  });

  it('opens dropdown when bell is clicked', async () => {
    await act(async () => {
      render(<NotificationsBell />);
    });
    const bell = screen.getByTitle('Notifications');
    await act(async () => {
      fireEvent.click(bell);
    });
    const dropdown = screen.getByText('You were mentioned');
    expect(dropdown).toBeInTheDocument();
  });

  it('marks notification as read when clicked', async () => {
    const { markNotificationRead } = await import('../api');
    await act(async () => {
      render(<NotificationsBell />);
    });
    const bell = screen.getByTitle('Notifications');
    await act(async () => {
      fireEvent.click(bell);
    });
    const notif = screen.getByText('You were mentioned');
    await act(async () => {
      fireEvent.click(notif);
    });
    expect(markNotificationRead).toHaveBeenCalledWith('1');
  });

  it('closes dropdown when clicking bell again', async () => {
    await act(async () => {
      render(<NotificationsBell />);
    });
    const bell = screen.getByTitle('Notifications');
    await act(async () => {
      fireEvent.click(bell);
    });
    expect(screen.getByText('You were mentioned')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(bell);
    });
    expect(screen.queryByText('You were mentioned')).not.toBeInTheDocument();
  });

  it('returns null when user is not logged in', async () => {
    const { useAuthStore } = await import('../stores/authStore');
    vi.mocked(useAuthStore).mockImplementation((selector) => {
      const state = { user: null };
      return selector ? selector(state) : state;
    });
    await act(async () => {
      render(<NotificationsBell />);
    });
    const bell = screen.queryByTitle('Notifications');
    expect(bell).not.toBeInTheDocument();
  });
});
