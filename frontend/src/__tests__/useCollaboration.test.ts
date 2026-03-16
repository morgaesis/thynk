import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

describe('useCollaboration', () => {
  it('returns initial state when noteId is undefined', async () => {
    const { result } = renderHook(() => {
      const { useCollaboration } = require('../hooks/useCollaboration');
      return useCollaboration(undefined);
    });

    expect(result.current.provider).toBeNull();
    expect(result.current.ydoc).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.users).toEqual([]);
  });

  it('returns initial state when noteId is null', async () => {
    const { result } = renderHook(() => {
      const { useCollaboration } = require('../hooks/useCollaboration');
      return useCollaboration(null);
    });

    expect(result.current.provider).toBeNull();
    expect(result.current.ydoc).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.users).toEqual([]);
  });
});
