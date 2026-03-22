import type { CollabUser } from '../hooks/useCollaboration';

const MAX_VISIBLE = 5;

interface Props {
  users: CollabUser[];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function PresenceIndicator({ users }: Props) {
  if (users.length === 0) {
    return null;
  }

  const visible = users.slice(0, MAX_VISIBLE);
  const overflow = users.length - MAX_VISIBLE;
  const tooltip = users.map((u) => u.name).join(', ');

  return (
    <div className="flex items-center" title={`${tooltip} viewing`}>
      {visible.map((user, index) => (
        <div
          key={index}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium text-white ring-2 ring-surface dark:ring-surface-dark"
          style={{
            backgroundColor: user.color,
            marginLeft: index > 0 ? '-4px' : '0',
            zIndex: visible.length - index,
          }}
          title={user.name}
        >
          {getInitials(user.name)}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium text-text-muted dark:text-text-muted-dark bg-border dark:bg-border-dark ring-2 ring-surface dark:ring-surface-dark"
          style={{ marginLeft: '-4px', zIndex: 0 }}
          title={users
            .slice(MAX_VISIBLE)
            .map((u) => u.name)
            .join(', ')}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
