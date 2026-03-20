import { useEffect, useState, useCallback, useRef } from 'react';
import { VscBell, VscCheck } from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';
import { useAuthStore } from '../stores/authStore';
import { getNotifications, markNotificationRead, type Notification } from '../api';

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const notifs = await getNotifications();
      setNotifications(notifs);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.read) {
      await markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
    }
    setOpen(false);
    openNoteByPath(notif.notePath);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-md text-text-muted dark:text-text-muted-dark
                   hover:bg-border dark:hover:bg-border-dark transition-colors"
        title="Notifications"
      >
        <VscBell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-accent text-white text-[10px] font-bold
                           min-w-[16px] h-4 flex items-center justify-center rounded-full px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 z-50
                        bg-sidebar dark:bg-sidebar-dark
                        border border-border dark:border-border-dark
                        rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border dark:border-border-dark">
            <span className="text-xs font-semibold text-text dark:text-text-dark uppercase tracking-wider">
              Notifications
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-3 text-xs text-text-muted dark:text-text-muted-dark">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-3 py-3 text-xs text-text-muted dark:text-text-muted-dark">
                No notifications
              </div>
            ) : (
              <ul>
                {notifications.map((notif) => (
                  <li key={notif.id}>
                    <button
                      onClick={() => handleNotificationClick(notif)}
                      className={`flex items-start gap-2 w-full px-3 py-2.5 text-left text-sm
                        ${
                          notif.read
                            ? 'text-text-muted dark:text-text-muted-dark'
                            : 'bg-accent/5 dark:bg-accent/10 text-text dark:text-text-dark'
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
        </div>
      )}
    </div>
  );
}
