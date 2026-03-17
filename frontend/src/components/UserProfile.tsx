import { useEffect, useState } from 'react';
import { VscClose, VscAccount } from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';

interface NoteActivity {
  id: string;
  title: string;
  updated_at: string;
}

interface UserProfileData {
  id: string;
  username: string;
  display_name: string | null;
  recent_notes: NoteActivity[];
  mutual_work: NoteActivity[];
}

interface Props {
  username: string;
  onClose: () => void;
}

export function UserProfile({ username, onClose }: Props) {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const openNote = useNoteStore((s) => s.openNote);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/by-username/${encodeURIComponent(username)}/profile`, {
      credentials: 'same-origin',
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setProfile(data as UserProfileData);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const displayName = profile?.display_name ?? profile?.username ?? '';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      {/* Panel — slides in from right */}
      <div
        className="relative z-10 h-full w-80 bg-surface dark:bg-surface-dark
                   border-l border-border dark:border-border-dark
                   flex flex-col shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border-dark">
          <h2 className="text-sm font-semibold text-text dark:text-text-dark">User Profile</h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted dark:text-text-muted-dark hover:bg-border dark:hover:bg-border-dark"
          >
            <VscClose size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-sm text-text-muted dark:text-text-muted-dark">Loading…</span>
          </div>
        ) : !profile ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-sm text-text-muted dark:text-text-muted-dark">User not found.</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            {/* Avatar + name */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-white font-semibold text-sm">
                {initials || <VscAccount size={20} />}
              </div>
              <div>
                <p className="text-sm font-semibold text-text dark:text-text-dark">
                  {profile.display_name ?? profile.username}
                </p>
                <p className="text-xs text-text-muted dark:text-text-muted-dark">@{profile.username}</p>
              </div>
            </div>

            {/* Recent Activity */}
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted-dark mb-2">
              Recent Activity
            </h3>
            {profile.recent_notes.length === 0 ? (
              <p className="text-xs text-text-muted dark:text-text-muted-dark mb-4">No recent activity.</p>
            ) : (
              <ul className="space-y-1 mb-6">
                {profile.recent_notes.map((note) => (
                  <li key={note.id}>
                    <button
                      onClick={() => { openNote(note.id); onClose(); }}
                      className="w-full text-left px-2 py-1.5 rounded text-sm text-text dark:text-text-dark
                                 hover:bg-sidebar dark:hover:bg-sidebar-dark transition-colors"
                    >
                      <span className="truncate block">{note.title}</span>
                      <span className="text-xs text-text-muted dark:text-text-muted-dark">
                        {new Date(note.updated_at).toLocaleDateString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Mutual Work */}
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted-dark mb-2">
              Connected Through
            </h3>
            {profile.mutual_work.length === 0 ? (
              <p className="text-xs text-text-muted dark:text-text-muted-dark">No connected notes.</p>
            ) : (
              <ul className="space-y-1">
                {profile.mutual_work.map((note) => (
                  <li key={note.id}>
                    <button
                      onClick={() => { openNote(note.id); onClose(); }}
                      className="w-full text-left px-2 py-1.5 rounded text-sm text-text dark:text-text-dark
                                 hover:bg-sidebar dark:hover:bg-sidebar-dark transition-colors"
                    >
                      <span className="truncate block">{note.title}</span>
                      <span className="text-xs text-text-muted dark:text-text-muted-dark">
                        {new Date(note.updated_at).toLocaleDateString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
