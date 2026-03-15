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

  // Reset lock state when note changes (deferred to avoid cascading renders)
  useEffect(() => {
    stopHeartbeat();
    const id = setTimeout(() => {
      setLockState({
        locked: false,
        lockedByMe: false,
        lockedBy: null,
        expiresAt: null,
      });
    }, 0);
    return () => clearTimeout(id);
  }, [noteId, stopHeartbeat]);

  // On note change, check current lock status
  useEffect(() => {
    if (!noteId) return;

    let cancelled = false;

    const checkLock = async () => {
      try {
        const result = await getLock(noteId);
        if (cancelled) return;
        if (result.locked && result.user !== currentUserRef.current) {
          setLockState({
            locked: true,
            lockedByMe: false,
            lockedBy: result.user ?? null,
            expiresAt: result.expires_at ?? null,
          });
        } else if (!result.locked) {
          setLockState(prev =>
            prev.lockedByMe ? prev : {
              locked: false,
              lockedByMe: false,
              lockedBy: null,
              expiresAt: null,
            }
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
  }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Release lock on unmount if we hold it
  useEffect(() => {
    return () => {
      stopHeartbeat();
      const id = noteIdRef.current;
      if (id) {
        releaseLock(id).catch(() => {});
      }
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
