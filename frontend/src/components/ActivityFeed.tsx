import { useEffect, useState, useCallback } from 'react';
import { VscHistory } from 'react-icons/vsc';
import { useAuthStore } from '../stores/authStore';
import { getAuditLog, type AuditEntry } from '../api';

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getActionLabel(action: AuditEntry['action']): string {
  switch (action) {
    case 'create':
      return 'created';
    case 'update':
      return 'updated';
    case 'delete':
      return 'deleted';
    default:
      return action;
  }
}

function getActionColor(action: AuditEntry['action']): string {
  switch (action) {
    case 'create':
      return 'text-green-500';
    case 'update':
      return 'text-blue-500';
    case 'delete':
      return 'text-red-500';
    default:
      return 'text-text-muted';
  }
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const user = useAuthStore((s) => s.user);

  const fetchActivities = useCallback(async () => {
    if (!user) return;
    try {
      const entries = await getAuditLog({ limit: 20 });
      setActivities(entries);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchActivities();
    const interval = setInterval(fetchActivities, 60000);
    return () => clearInterval(interval);
  }, [fetchActivities]);

  if (!user) return null;

  return (
    <div className="border-t border-border dark:border-border-dark">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium
                   text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark"
      >
        <span className="flex items-center gap-2">
          <VscHistory className="w-4 h-4" />
          Activity
        </span>
      </button>

      {expanded && (
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-xs text-text-muted dark:text-text-muted-dark">
              Loading...
            </div>
          ) : activities.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-muted dark:text-text-muted-dark">
              No recent activity
            </div>
          ) : (
            <ul>
              {activities.map((entry) => (
                <li
                  key={entry.id}
                  className="px-3 py-2 text-xs text-text-muted dark:text-text-muted-dark"
                >
                  <span className={getActionColor(entry.action)}>
                    {getActionLabel(entry.action)}
                  </span>{' '}
                  <span className="text-text dark:text-text-dark">
                    {entry.note_id}
                  </span>
                  <span className="ml-2 opacity-60">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
