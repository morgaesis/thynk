import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes when pressing Escape key', () => {
    render(<ImportModal onClose={mockOnClose} onImported={mockOnImported} />);
    
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the modal content', () => {
    render(<ImportModal onClose={mockOnClose} onImported={mockOnImported} />);
    
    const modalContent = screen.getByText('Import Notes').closest('div[class*="border"]');
    expect(modalContent).toBeInTheDocument();
    
    fireEvent.click(modalContent!);
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
