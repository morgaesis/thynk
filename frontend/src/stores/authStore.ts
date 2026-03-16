import { create } from 'zustand';

export interface User {
  id: string;
  username: string;
  display_name: string | null;
  storage_used: number;
  storage_limit: number;
  role: string;
}

interface AuthStore {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  error: null,

  checkSession: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'same-origin',
      });
      if (res.ok) {
        const user: User = await res.json();
        set({ user, loading: false, error: null });
      } else {
        set({ user: null, loading: false });
      }
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (username: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const user: User = await res.json();
        set({ user, loading: false, error: null });
      } else {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { message?: string }).message ?? 'Login failed';
        set({ error: msg, loading: false });
        throw new Error(msg);
      }
    } catch (e) {
      if (!(e instanceof Error && e.message)) {
        set({ error: 'Login failed', loading: false });
      }
      throw e;
    }
  },

  logout: async () => {
    set({ loading: true });
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // ignore network errors on logout
    } finally {
      set({ user: null, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
