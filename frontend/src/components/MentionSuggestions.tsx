import { useEffect, useState, useCallback } from 'react';

interface User {
  id: string;
  username: string;
  display_name: string | null;
}

interface Props {
  query: string;
  onSelect: (username: string) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

export function MentionSuggestions({
  query,
  onSelect,
  onClose,
  anchorRect,
}: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch('/api/users');
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  const filtered = users
    .filter((u) => {
      const search = query.toLowerCase();
      return (
        u.username.toLowerCase().includes(search) ||
        (u.display_name && u.display_name.toLowerCase().includes(search))
      );
    })
    .slice(0, 10);

  const safeIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[safeIndex]) {
            onSelect(filtered[safeIndex].username);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    },
    [filtered, safeIndex, onSelect, onClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  if (loading) {
    return null;
  }

  if (filtered.length === 0) {
    return null;
  }

  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.bottom + 4,
    left: anchorRect.left,
    zIndex: 9999,
  };

  return (
    <div
      style={style}
      className="bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                 rounded-lg shadow-lg overflow-hidden min-w-[200px] max-w-[320px]"
    >
      <ul role="listbox" aria-label="User suggestions">
        {filtered.map((user, i) => (
          <li
            key={user.id}
            role="option"
            aria-selected={i === safeIndex}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => onSelect(user.username)}
            className={`px-3 py-2 text-sm cursor-pointer select-none
              ${
                i === safeIndex
                  ? 'bg-accent/10 text-accent'
                  : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
              }`}
          >
            <span className="font-medium">@{user.username}</span>
            {user.display_name && (
              <span className="text-text-muted dark:text-text-muted-dark ml-2">
                {user.display_name}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}