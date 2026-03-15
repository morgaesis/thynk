import { useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const authError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const error = localError ?? authError;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!username.trim() || !password) return;

      setLocalError(null);
      clearError();
      setSubmitting(true);

      try {
        if (mode === 'register') {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ username: username.trim(), password }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(
              (body as { message?: string }).message ?? 'Registration failed',
            );
          }
          // After register, log in automatically.
          await login(username.trim(), password);
        } else {
          await login(username.trim(), password);
        }
      } catch (err) {
        setLocalError((err as Error).message ?? 'Something went wrong');
      } finally {
        setSubmitting(false);
      }
    },
    [mode, username, password, login, clearError],
  );

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setLocalError(null);
    clearError();
  }, [clearError]);

  return (
    <div className="min-h-screen flex items-center justify-center
                    bg-surface dark:bg-surface-dark
                    px-4">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-text dark:text-text-dark tracking-tight">
            Thynk
          </h1>
          <p className="mt-1 text-sm text-text-muted dark:text-text-muted-dark">
            {mode === 'login' ? 'Sign in to your notes' : 'Create your account'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-sidebar dark:bg-sidebar-dark rounded-xl shadow-lg
                        border border-border dark:border-border-dark p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-medium text-text-muted dark:text-text-muted-dark mb-1"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm rounded-md
                           bg-surface dark:bg-surface-dark
                           text-text dark:text-text-dark
                           border border-border dark:border-border-dark
                           focus:outline-none focus:ring-2 focus:ring-accent
                           placeholder:text-text-muted dark:placeholder:text-text-muted-dark"
                placeholder="your-username"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-text-muted dark:text-text-muted-dark mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={
                  mode === 'register' ? 'new-password' : 'current-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm rounded-md
                           bg-surface dark:bg-surface-dark
                           text-text dark:text-text-dark
                           border border-border dark:border-border-dark
                           focus:outline-none focus:ring-2 focus:ring-accent
                           placeholder:text-text-muted dark:placeholder:text-text-muted-dark"
                placeholder="••••••••"
              />
            </div>

            {/* Error message */}
            {error && (
              <p className="text-xs text-red-500 bg-red-500/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !username.trim() || !password}
              className="w-full py-2 px-4 rounded-md text-sm font-medium
                         bg-accent text-white
                         hover:bg-accent/90 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? mode === 'login'
                  ? 'Signing in…'
                  : 'Creating account…'
                : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </form>

          {/* Toggle link */}
          <div className="mt-4 text-center">
            <button
              onClick={toggleMode}
              className="text-xs text-text-muted dark:text-text-muted-dark
                         hover:text-text dark:hover:text-text-dark transition-colors underline"
            >
              {mode === 'login'
                ? 'New here? Create an account'
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
