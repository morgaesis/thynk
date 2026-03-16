import { useEffect, useState, useCallback } from 'react';
import { VscBell, VscCheck } from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';
import { useAuthStore } from '../stores/authStore';
import { getNotifications, markNotificationRead, type Notification } from '../api';

export function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const user = useAuthStore((s) => s.user);
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const notifs = await getNotifications();
      setNotifications(notifs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.read) {
      await markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
    }
    openNoteByPath(notif.notePath);
  };

  if (!user) return null;

  return (
    <div className="border-t border-border dark:border-border-dark">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium
                   text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark"
      >
        <span className="flex items-center gap-2">
          <VscBell className="w-4 h-4" />
          Notifications
        </span>
        {unreadCount > 0 && (
          <span className="bg-accent text-white text-xs px-1.5 py-0.5 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {expanded && (
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-xs text-text-muted dark:text-text-muted-dark">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-muted dark:text-text-muted-dark">
              No notifications
            </div>
          ) : (
            <ul>
              {notifications.map((notif) => (
                <li key={notif.id}>
                  <button
                    onClick={() => handleNotificationClick(notif)}
                    className={`flex items-start gap-2 w-full px-3 py-2 text-left text-sm
                      ${
                        notif.read
                          ? 'text-text-muted dark:text-text-muted-dark'
                          : 'bg-accent/5 dark:bg-accent/10'
                      }
                      hover:bg-border dark:hover:bg-border-dark`}
                  >
                    <span className="flex-1 truncate">{notif.message}</span>
                    {notif.read ? null : (
                      <VscCheck className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
