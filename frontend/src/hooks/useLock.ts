import { useState, useEffect, useRef, useCallback } from 'react';
import { acquireLock, releaseLock, heartbeatLock, getLock } from '../api';

export interface LockState {
  locked: boolean;
  lockedByMe: boolean;
  lockedBy: string | null;
  expiresAt: string | null;
}

interface UseLockReturn extends LockState {
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

function getLockIntentKey(noteId: string): string {
  return `thynk-lock-${noteId}`;
}

function getStoredLockIntent(noteId: string): string | null {
  try {
    return sessionStorage.getItem(getLockIntentKey(noteId));
  } catch {
    return null;
  }
}

function setStoredLockIntent(noteId: string, user: string): void {
  try {
    sessionStorage.setItem(getLockIntentKey(noteId), user);
  } catch {
    // sessionStorage not available
  }
}

function clearStoredLockIntent(noteId: string): void {
  try {
    sessionStorage.removeItem(getLockIntentKey(noteId));
  } catch {
    // sessionStorage not available
  }
}

export function useLock(
  noteId: string | undefined,
  currentUser: string,
): UseLockReturn {
  const [lockState, setLockState] = useState<LockState>({
    locked: false,
    lockedByMe: false,
    lockedBy: null,
    expiresAt: null,
  });

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noteIdRef = useRef(noteId);
  const currentUserRef = useRef(currentUser);

  // Keep refs current without triggering re-renders.
  useEffect(() => {
    noteIdRef.current = noteId;
    currentUserRef.current = currentUser;
  });

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(
    (id: string) => {
      stopHeartbeat();
      heartbeatRef.current = setInterval(async () => {
        try {
          const result = await heartbeatLock(id);
          if (result.locked && result.user === currentUserRef.current) {
            setLockState({
              locked: true,
              lockedByMe: true,
              lockedBy: result.user ?? null,
              expiresAt: result.expires_at ?? null,
            });
          } else {
            // Lost the lock somehow
            stopHeartbeat();
            setLockState({
              locked: false,
              lockedByMe: false,
              lockedBy: null,
              expiresAt: null,
            });
          }
        } catch {
          // Heartbeat failed — lock may have been taken by someone else
          stopHeartbeat();
          setLockState({
            locked: false,
            lockedByMe: false,
            lockedBy: null,
            expiresAt: null,
          });
        }
      }, HEARTBEAT_INTERVAL_MS);
    },
    [stopHeartbeat],
  );

  // Reset lock state when note changes.
  // Deferred via microtask so the reset is queued before any async checkLock
  // continuation, preserving the invariant: reset → then server state.
  useEffect(() => {
    stopHeartbeat();
    void Promise.resolve().then(() =>
      setLockState({
        locked: false,
        lockedByMe: false,
        lockedBy: null,
        expiresAt: null,
      }),
    );
  }, [noteId, stopHeartbeat]);

  // On note change, check current lock status
  useEffect(() => {
    if (!noteId) return;

    let cancelled = false;

    const checkLock = async () => {
      try {
        const result = await getLock(noteId);
        if (cancelled) return;

        // Check if current user previously held this lock (page refresh scenario)
        const storedUser = getStoredLockIntent(noteId);
        const isCurrentUser = storedUser === currentUserRef.current;

        if (result.locked && result.user !== currentUserRef.current) {
          // Lock held by another user
          setLockState({
            locked: true,
            lockedByMe: false,
            lockedBy: result.user ?? null,
            expiresAt: result.expires_at ?? null,
          });
        } else if (!result.locked && isCurrentUser) {
          // No lock in DB but current user had it before - try to re-acquire
          try {
            const acquireResult = await acquireLock(noteId);
            if (cancelled) return;
            if (
              acquireResult.locked &&
              acquireResult.user === currentUserRef.current
            ) {
              setLockState({
                locked: true,
                lockedByMe: true,
                lockedBy: acquireResult.user ?? null,
                expiresAt: acquireResult.expires_at ?? null,
              });
              startHeartbeat(noteId);
            } else if (acquireResult.locked) {
              // Someone else got the lock while we were trying
              clearStoredLockIntent(noteId);
              setLockState({
                locked: true,
                lockedByMe: false,
                lockedBy: acquireResult.user ?? null,
                expiresAt: acquireResult.expires_at ?? null,
              });
            }
          } catch {
            // Failed to re-acquire - clear stored intent
            clearStoredLockIntent(noteId);
          }
        } else if (!result.locked) {
          setLockState((prev) =>
            prev.lockedByMe
              ? prev
              : {
                  locked: false,
                  lockedByMe: false,
                  lockedBy: null,
                  expiresAt: null,
                },
          );
        }
      } catch {
        // ignore
      }
    };

    void checkLock();
    const interval = setInterval(checkLock, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [noteId, startHeartbeat]); // intentionally omit currentUserRef — it's a ref, not a reactive value

  // Stop heartbeat on unmount, but don't release the lock in DB.
  // The lock intent is stored in sessionStorage to survive page refreshes.
  useEffect(() => {
    return () => {
      stopHeartbeat();
    };
  }, [stopHeartbeat]);

  const doAcquireLock = useCallback(async (): Promise<boolean> => {
    if (!noteId) return false;
    try {
      const result = await acquireLock(noteId);
      if (result.locked && result.user === currentUser) {
        setLockState({
          locked: true,
          lockedByMe: true,
          lockedBy: result.user ?? null,
          expiresAt: result.expires_at ?? null,
        });
        setStoredLockIntent(noteId, currentUser);
        startHeartbeat(noteId);
        return true;
      } else if (result.locked) {
        setLockState({
          locked: true,
          lockedByMe: false,
          lockedBy: result.user ?? null,
          expiresAt: result.expires_at ?? null,
        });
        return false;
      }
    } catch {
      // 409 Conflict — locked by someone else
      return false;
    }
    return false;
  }, [noteId, currentUser, startHeartbeat]);

  const doReleaseLock = useCallback(async (): Promise<void> => {
    if (!noteId) return;
    stopHeartbeat();
    clearStoredLockIntent(noteId);
    try {
      await releaseLock(noteId);
    } catch {
      // ignore
    }
    setLockState({
      locked: false,
      lockedByMe: false,
      lockedBy: null,
      expiresAt: null,
    });
  }, [noteId, stopHeartbeat]);

  return {
    ...lockState,
    acquireLock: doAcquireLock,
    releaseLock: doReleaseLock,
  };
}
