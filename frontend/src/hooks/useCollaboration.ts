import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { useAuthStore } from '../stores/authStore';

export interface CollabUser {
  name: string;
  color: string;
}

const COLORS = [
  '#958DF1',
  '#F98181',
  '#FBBC88',
  '#FAF594',
  '#70CFF8',
  '#94FADB',
  '#B9F18D',
];

function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export interface CollabState {
  provider: WebrtcProvider | null;
  ydoc: Y.Doc | null;
  connected: boolean;
  users: CollabUser[];
}

interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

let iceServersCache: IceServer[] | null = null;

async function fetchIceServers(): Promise<IceServer[]> {
  if (iceServersCache) return iceServersCache;
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json() as { ice_servers: IceServer[] };
      iceServersCache = data.ice_servers;
      return iceServersCache;
    }
  } catch {
    // fallback to public STUN
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

export { fetchIceServers };

export function useCollaboration(noteId: string | undefined) {
  const user = useAuthStore((s) => s.user);
  const [collabState, setCollabState] = useState<CollabState>({
    provider: null,
    ydoc: null,
    connected: false,
    users: [],
  });

  const providerRef = useRef<WebrtcProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  useEffect(() => {
    if (!noteId) {
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
        ydocRef.current = null;
      }
      queueMicrotask(() => {
        setCollabState({
          provider: null,
          ydoc: null,
          connected: false,
          users: [],
        });
      });
      return;
    }

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const roomName = `thynk-note-${noteId}`;
    const username = user?.username ?? 'Anonymous';

    const getSignalingUrl = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      return `${protocol}//${host}/api/signaling?room=${encodeURIComponent(roomName)}`;
    };

    const provider = new WebrtcProvider(roomName, ydoc, {
      signaling: [getSignalingUrl()],
      password: undefined,
      awareness: undefined,
      maxConns: 20,
      filterBcConns: true,
      peerOpts: {},
    });

    providerRef.current = provider;

    const userColor = getRandomColor();
    provider.awareness.setLocalStateField('user', {
      name: username,
      color: userColor,
    });

    fetchIceServers().then((iceServers) => {
      if (iceServers.length > 0) {
        (provider as unknown as { peerOpts: { config: { iceServers: IceServer[] } } }).peerOpts = {
          config: { iceServers },
        };
      }
    });

    const updateUsers = () => {
      const states = provider.awareness.getStates();
      const users: CollabUser[] = [];
      states.forEach((state) => {
        if (state.user) {
          users.push(state.user as CollabUser);
        }
      });
      setCollabState((prev) => ({ ...prev, users }));
    };

    provider.awareness.on('change', updateUsers);
    provider.on('synced', () => {
      setCollabState((prev) => ({ ...prev, connected: true }));
    });

    queueMicrotask(() => {
      setCollabState({
        provider,
        ydoc,
        connected: false,
        users: [{ name: username, color: userColor }],
      });
    });

    return () => {
      provider.awareness.off('change', updateUsers);
      provider.destroy();
      ydoc.destroy();
      providerRef.current = null;
      ydocRef.current = null;
    };
  }, [noteId, user?.username]);

  return collabState;
}

export function getRandomColorExport(): string {
  return getRandomColor();
}
