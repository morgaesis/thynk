import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('y-webrtc', () => ({
  WebrtcProvider: vi.fn().mockImplementation(() => ({
    awareness: {
      setLocalStateField: vi.fn(),
      getStates: vi.fn().mockReturnValue(new Map()),
      on: vi.fn(),
      off: vi.fn(),
    },
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
    synced: false,
  })),
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn((selector) => selector({ user: null, loading: false, error: null })),
}));

import { useCollaboration } from '../hooks/useCollaboration';

describe('useCollaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state when noteId is undefined', async () => {
    const { result } = renderHook(() => useCollaboration(undefined));

    expect(result.current.provider).toBeNull();
    expect(result.current.ydoc).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.users).toEqual([]);
  });

  it('returns initial state when noteId is null', async () => {
    const { result } = renderHook(() => useCollaboration(null));

    expect(result.current.provider).toBeNull();
    expect(result.current.ydoc).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.users).toEqual([]);
  });
});
