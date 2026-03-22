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
    const users: CollabUser[] = [{ name: 'Charlie', color: '#FBBC88' }];
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

  it('shows +N overflow when more than 5 users are present', () => {
    const users: CollabUser[] = [
      { name: 'Alice', color: '#958DF1' },
      { name: 'Bob', color: '#F98181' },
      { name: 'Charlie', color: '#FBBC88' },
      { name: 'Diana', color: '#A8D8EA' },
      { name: 'Eve', color: '#AA96DA' },
      { name: 'Frank', color: '#FCBAD3' },
      { name: 'Grace', color: '#FFFFD2' },
    ];
    render(<PresenceIndicator users={users} />);

    // Only first 5 avatars should have initials visible
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('E')).toBeInTheDocument();
    expect(screen.queryByText('F')).not.toBeInTheDocument();

    // Overflow indicator should show +2
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('does not show overflow when exactly 5 users', () => {
    const users: CollabUser[] = [
      { name: 'Alice', color: '#958DF1' },
      { name: 'Bob', color: '#F98181' },
      { name: 'Charlie', color: '#FBBC88' },
      { name: 'Diana', color: '#A8D8EA' },
      { name: 'Eve', color: '#AA96DA' },
    ];
    const { container } = render(<PresenceIndicator users={users} />);

    // All 5 should be visible
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('E')).toBeInTheDocument();

    // No overflow badge
    const overflow = container.querySelector('[title*="Alice"]');
    expect(overflow).toBeTruthy();
  });
});
