import { VscLock } from 'react-icons/vsc';

interface Props {
  locked: boolean;
  lockedByMe: boolean;
  lockedBy: string | null;
  onAcquire: () => void;
  onRelease: () => void;
}

export function LockIndicator({
  locked,
  lockedByMe,
  lockedBy,
  onAcquire,
  onRelease,
}: Props) {
  if (!locked) {
    return (
      <button
        onClick={onAcquire}
        title="Lock for editing"
        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs
                   text-text-muted dark:text-text-muted-dark
                   hover:bg-border dark:hover:bg-border-dark transition-colors"
      >
        <VscLock size={12} />
        <span>Lock</span>
      </button>
    );
  }

  if (lockedByMe) {
    return (
      <button
        onClick={onRelease}
        title="Release lock"
        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs
                   text-green-600 dark:text-green-400
                   hover:bg-green-500/10 transition-colors"
      >
        <VscLock size={12} />
        <span>Locked by you</span>
      </button>
    );
  }

  return (
    <div
      title={`Locked by ${lockedBy ?? 'another user'}`}
      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs
                 text-red-500 dark:text-red-400"
    >
      <VscLock size={12} />
      <span>Locked by {lockedBy}</span>
    </div>
  );
}
