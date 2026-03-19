import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImportModal } from '../components/ImportModal';

vi.mock('../api', () => ({
  importMarkdown: vi.fn(),
  importObsidian: vi.fn(),
}));

describe('ImportModal', () => {
  const mockOnClose = vi.fn();
  const mockOnImported = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('closes when pressing Escape key', async () => {
    render(<ImportModal onClose={mockOnClose} onImported={mockOnImported} />);
    
    await waitFor(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the modal content', async () => {
    render(<ImportModal onClose={mockOnClose} onImported={mockOnImported} />);
    
    const uploadLabel = screen.getByText('Click to select a .zip file');
    await waitFor(() => {
      fireEvent.click(uploadLabel);
    });
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
