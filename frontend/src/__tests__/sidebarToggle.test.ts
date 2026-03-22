import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';

/**
 * Tests for the Ctrl+B sidebar toggle shortcut.
 */
describe('sidebar toggle shortcut (Ctrl+B)', () => {
  let toggleSidebar: ReturnType<typeof vi.fn>;
  let cleanup: () => void;

  beforeEach(() => {
    toggleSidebar = vi.fn();

    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.metaKey || e.ctrlKey;
      if (ctrl && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    cleanup = () => window.removeEventListener('keydown', handleKeyDown);
  });

  afterEach(() => {
    cleanup();
  });

  it('Ctrl+B calls toggleSidebar', () => {
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(toggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('Meta+B calls toggleSidebar (macOS)', () => {
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(toggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('plain B does not toggle sidebar', () => {
    fireEvent.keyDown(window, { key: 'b' });
    expect(toggleSidebar).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+B does not toggle sidebar (different combo)', () => {
    fireEvent.keyDown(window, { key: 'B', ctrlKey: true, shiftKey: true });
    // Ctrl+Shift+B matches ctrl+b since key is 'B' uppercase
    // Our handler checks e.key === 'b' (lowercase), so this should NOT match
    expect(toggleSidebar).not.toHaveBeenCalled();
  });
});
