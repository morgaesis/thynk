import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock the api module
vi.mock('../api', () => ({
  getLock: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  heartbeatLock: vi.fn(),
}));

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
vi.stubGlobal('sessionStorage', mockSessionStorage);

import { useLock } from '../hooks/useLock';
import * as api from '../api';

const mockGetLock = api.getLock as ReturnType<typeof vi.fn>;
const mockAcquireLock = api.acquireLock as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionStorage.getItem.mockReturnValue(null);
  // releaseLock must always resolve to avoid hanging on unmount cleanup
  (api.releaseLock as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useLock – lock detection on note open', () => {
  it('sets locked=true and lockedByMe=false when another user holds the lock', async () => {
    mockGetLock.mockResolvedValue({
      locked: true,
      user: 'alice',
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    });

    const { result, unmount } = renderHook(() => useLock('note-1', 'bob'));

    await waitFor(() => {
      expect(result.current.locked).toBe(true);
    }, { timeout: 3000 });

    expect(result.current.lockedByMe).toBe(false);
    expect(result.current.lockedBy).toBe('alice');

    unmount();
  });

  it('stays unlocked when no lock on server', async () => {
    mockGetLock.mockResolvedValue({ locked: false });

    const { result, unmount } = renderHook(() => useLock('note-1', 'bob'));

    // Give it time to check
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.locked).toBe(false);
    expect(result.current.lockedByMe).toBe(false);

    unmount();
  });

  it('acquireLock sets lockedByMe=true for the lock owner', async () => {
    mockGetLock.mockResolvedValue({ locked: false });
    mockAcquireLock.mockResolvedValue({
      locked: true,
      user: 'bob',
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    });

    const { result, unmount } = renderHook(() => useLock('note-1', 'bob'));

    await act(async () => {
      await result.current.acquireLock();
    });

    expect(result.current.locked).toBe(true);
    expect(result.current.lockedByMe).toBe(true);
    expect(result.current.lockedBy).toBe('bob');

    unmount();
  });

  it('after note switch, lock from server is reflected (no reset override)', async () => {
    // First note is unlocked
    mockGetLock.mockResolvedValue({ locked: false });

    const { result, rerender, unmount } = renderHook(
      ({ noteId, user }: { noteId: string; user: string }) => useLock(noteId, user),
      { initialProps: { noteId: 'note-1', user: 'bob' } },
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.locked).toBe(false);

    // Second note is locked by alice
    mockGetLock.mockResolvedValue({
      locked: true,
      user: 'alice',
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    });

    rerender({ noteId: 'note-2', user: 'bob' });

    // The lock state must eventually show alice's lock, not get stuck on unlocked
    await waitFor(() => {
      expect(result.current.locked).toBe(true);
    }, { timeout: 3000 });

    expect(result.current.lockedByMe).toBe(false);
    expect(result.current.lockedBy).toBe('alice');

    unmount();
  });

  it('re-acquires lock on page refresh if user previously held it', async () => {
    // Simulate: user had a lock on note-1, refreshed the page
    // sessionStorage has the stored intent
    mockSessionStorage.getItem.mockReturnValue('bob');

    // getLock returns no lock (because old component released it on unmount)
    mockGetLock.mockResolvedValue({ locked: false });

    // acquireLock should be called to re-acquire the lock
    mockAcquireLock.mockResolvedValue({
      locked: true,
      user: 'bob',
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    });

    const { result, unmount } = renderHook(() => useLock('note-1', 'bob'));

    // Should eventually re-acquire the lock
    await waitFor(() => {
      expect(result.current.lockedByMe).toBe(true);
    }, { timeout: 3000 });

    expect(result.current.locked).toBe(true);
    expect(result.current.lockedBy).toBe('bob');

    unmount();
  });
});
