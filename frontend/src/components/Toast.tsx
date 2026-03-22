import { useEffect, useRef, useCallback, useState } from 'react';
import { VscClose, VscCheck, VscWarning, VscInfo } from 'react-icons/vsc';
import { useUIStore } from '../stores/uiStore';

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

interface ToastData {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

const DISMISS_MS = 5000;

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(DISMISS_MS);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    startRef.current = Date.now();
    timerRef.current = setTimeout(onDismiss, remainingRef.current);
  }, [onDismiss]);

  useEffect(() => {
    scheduleDismiss();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scheduleDismiss]);

  const handleMouseEnter = useCallback(() => {
    setPaused(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    remainingRef.current -= Date.now() - startRef.current;
  }, []);

  const handleMouseLeave = useCallback(() => {
    setPaused(false);
    scheduleDismiss();
  }, [scheduleDismiss]);

  const icons = {
    success: <VscCheck size={15} />,
    error: <VscWarning size={15} />,
    info: <VscInfo size={15} />,
  };

  const colors = {
    success:
      'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400',
    info: 'bg-accent/10 border-accent/30 text-accent',
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg
                  pointer-events-auto max-w-sm text-sm transition-all duration-200
                  ${paused ? 'scale-[1.02]' : ''}
                  bg-surface dark:bg-surface-dark
                  ${colors[toast.type]}`}
    >
      <span className="shrink-0">{icons[toast.type]}</span>
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <VscClose size={14} />
      </button>
    </div>
  );
}
