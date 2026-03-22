import { useEffect, useState, useCallback } from 'react';
import { VscHistory } from 'react-icons/vsc';
import { useAuthStore } from '../stores/authStore';
import { useNoteStore } from '../stores/noteStore';
import { getAuditLog, type AuditEntry } from '../api';
import { relativeTime } from '../utils/relativeTime';

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
  const notes = useNoteStore((s) => s.notes);

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
              {activities.map((entry) => {
                const noteTitle =
                  notes.find((n) => n.id === entry.note_id)?.title ??
                  entry.note_id;
                return (
                  <li
                    key={entry.id}
                    className="px-3 py-2 text-xs text-text-muted dark:text-text-muted-dark"
                  >
                    <span className={getActionColor(entry.action)}>
                      {getActionLabel(entry.action)}
                    </span>{' '}
                    <span className="text-text dark:text-text-dark truncate">
                      {noteTitle}
                    </span>
                    <span className="ml-2 opacity-60 shrink-0">
                      {relativeTime(entry.timestamp, 7)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
