import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenceIndicator } from '../components/PresenceIndicator';
import type { CollabUser } from '../hooks/useCollaboration';

describe('PresenceIndicator', () => {
  it('renders nothing when users array is empty', () => {
    const { container } = render(<PresenceIndicator users={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders user avatars when users are present', () => {
    const users: CollabUser[] = [
      { name: 'Alice', color: '#958DF1' },
      { name: 'Bob', color: '#F98181' },
    ];
    render(<PresenceIndicator users={users} />);
    
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('shows avatar circles with correct colors', () => {
    const users: CollabUser[] = [
      { name: 'Charlie', color: '#FBBC88' },
    ];
    render(<PresenceIndicator users={users} />);
    
    const avatar = screen.getByText('C').closest('div');
    expect(avatar).toHaveStyle({ backgroundColor: '#FBBC88' });
  });

  it('shows "viewing" tooltip with user names', () => {
    const users: CollabUser[] = [
      { name: 'Alice', color: '#958DF1' },
      { name: 'Bob', color: '#F98181' },
    ];
    const { container } = render(<PresenceIndicator users={users} />);
    
    const outer = container.firstChild as HTMLElement;
    expect(outer).toHaveAttribute('title', 'Alice, Bob viewing');
  });
});
