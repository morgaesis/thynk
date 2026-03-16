import type { CollabUser } from '../hooks/useCollaboration';

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

  const tooltip = users.map((u) => u.name).join(', ');

  return (
    <div
      className="flex items-center gap-1"
      title={`${tooltip} viewing`}
    >
      {users.map((user, index) => (
        <div
          key={index}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium text-white"
          style={{ backgroundColor: user.color }}
          title={user.name}
        >
          {getInitials(user.name)}
        </div>
      ))}
    </div>
  );
}
