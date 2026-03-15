import { useCallback, useState } from 'react';
import { VscArrowLeft } from 'react-icons/vsc';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { exportWorkspace } from '../api';
import { ImportModal } from './ImportModal';
import type { User } from '../stores/authStore';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-text dark:text-text-dark uppercase tracking-wide mb-3">
      {children}
    </h2>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border dark:border-border-dark last:border-b-0">
      <span className="text-sm text-text dark:text-text-dark">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function RadioGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            value === opt.value
              ? 'bg-accent text-white'
              : 'bg-border dark:bg-border-dark text-text-muted dark:text-text-muted-dark hover:text-text dark:hover:text-text-dark'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-border dark:bg-border-dark'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

interface SettingsPageProps {
  onClose?: () => void;
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const {
    fontSize,
    vimMode,
    lineHeight,
    spellCheck,
    setFontSize,
    setVimMode,
    setLineHeight,
    setSpellCheck,
  } = useSettingsStore();
  const authUser = useAuthStore((s) => s.user);
  const checkSession = useAuthStore((s) => s.checkSession);

  const [exporting, setExporting] = useState(false);
  const [showImport, setShowImport] = useState<'markdown' | 'obsidian' | null>(
    null,
  );
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameValue, setDisplayNameValue] = useState(
    authUser?.display_name ?? authUser?.username ?? '',
  );
  const [savingName, setSavingName] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);

  const handleSaveDisplayName = useCallback(async () => {
    setSavingName(true);
    setDisplayNameError(null);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ display_name: displayNameValue || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      const updated = (await res.json()) as User;
      useAuthStore.setState({ user: updated });
      setEditingDisplayName(false);
      void checkSession();
    } catch (e) {
      setDisplayNameError(
        e instanceof Error ? e.message : 'Failed to save display name',
      );
    } finally {
      setSavingName(false);
    }
  }, [displayNameValue, checkSession]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportWorkspace();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, []);

  const handleBack = () => {
    if (onClose) onClose();
    else window.history.back();
  };

  return (
    <>
      <div className="h-full overflow-y-auto bg-surface dark:bg-surface-dark">
        <div className="max-w-2xl mx-auto px-8 py-10">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <button
              onClick={handleBack}
              className="p-1.5 rounded-md text-text-muted dark:text-text-muted-dark
                       hover:bg-border dark:hover:bg-border-dark transition-colors"
              title="Back"
            >
              <VscArrowLeft size={16} />
            </button>
            <h1 className="text-2xl font-bold text-text dark:text-text-dark">
              Settings
            </h1>
          </div>

          {/* Editor Section */}
          <section className="mb-8">
            <SectionTitle>Editor</SectionTitle>
            <div className="bg-sidebar dark:bg-sidebar-dark rounded-lg border border-border dark:border-border-dark px-4">
              <Row label="Font size (px)">
                <input
                  type="number"
                  min={10}
                  max={32}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-sm rounded border border-border dark:border-border-dark
                           bg-surface dark:bg-surface-dark text-text dark:text-text-dark"
                />
              </Row>
              <Row label="Line height">
                <input
                  type="number"
                  min={1.0}
                  max={3.0}
                  step={0.1}
                  value={lineHeight}
                  onChange={(e) => setLineHeight(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-sm rounded border border-border dark:border-border-dark
                           bg-surface dark:bg-surface-dark text-text dark:text-text-dark"
                />
              </Row>
              <Row label="Vim mode">
                <Toggle checked={vimMode} onChange={setVimMode} />
              </Row>
              <Row label="Spell check">
                <Toggle checked={spellCheck} onChange={setSpellCheck} />
              </Row>
            </div>
          </section>

          {/* Theme Section */}
          <section className="mb-8">
            <SectionTitle>Theme</SectionTitle>
            <div className="bg-sidebar dark:bg-sidebar-dark rounded-lg border border-border dark:border-border-dark px-4">
              <Row label="Color theme">
                <RadioGroup
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                  value={theme}
                  onChange={setTheme}
                />
              </Row>
            </div>
          </section>

          {/* Account Section */}
          <section className="mb-8">
            <SectionTitle>Account</SectionTitle>
            <div className="bg-sidebar dark:bg-sidebar-dark rounded-lg border border-border dark:border-border-dark px-4">
              {authUser ? (
                <>
                  <Row label="Username">
                    <span className="text-sm text-text-muted dark:text-text-muted-dark">
                      {authUser.username}
                    </span>
                  </Row>
                  <Row label="Display name">
                    {editingDisplayName ? (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <input
                            value={displayNameValue}
                            onChange={(e) =>
                              setDisplayNameValue(e.target.value)
                            }
                            className="px-2 py-0.5 text-sm rounded border border-border dark:border-border-dark
                                       bg-surface dark:bg-surface-dark text-text dark:text-text-dark"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter')
                                void handleSaveDisplayName();
                              if (e.key === 'Escape')
                                setEditingDisplayName(false);
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => void handleSaveDisplayName()}
                            disabled={savingName}
                            className="text-xs text-accent hover:underline disabled:opacity-50"
                          >
                            {savingName ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingDisplayName(false)}
                            className="text-xs text-text-muted dark:text-text-muted-dark hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                        {displayNameError && (
                          <span className="text-xs text-red-500">
                            {displayNameError}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-muted dark:text-text-muted-dark">
                          {authUser.display_name ?? authUser.username}
                        </span>
                        <button
                          onClick={() => {
                            setDisplayNameValue(
                              authUser.display_name ?? authUser.username,
                            );
                            setEditingDisplayName(true);
                          }}
                          className="text-xs text-accent hover:underline"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </Row>
                  <Row label="Upload storage">
                    <span className="text-sm text-text-muted dark:text-text-muted-dark">
                      {formatBytes(authUser.storage_used)} used of{' '}
                      {formatBytes(authUser.storage_limit)}
                    </span>
                  </Row>
                  <Row label="Sign out">
                    <button
                      onClick={() => useAuthStore.getState().logout()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded
                               bg-border dark:bg-border-dark text-text dark:text-text-dark
                               hover:bg-red-500/10 hover:text-red-500 transition-colors"
                    >
                      Sign out
                    </button>
                  </Row>
                </>
              ) : (
                <div className="py-3 text-sm text-text-muted dark:text-text-muted-dark">
                  Not signed in.
                </div>
              )}
            </div>
          </section>

          {/* Import / Export Section */}
          <section className="mb-8">
            <SectionTitle>Import / Export</SectionTitle>
            <div className="bg-sidebar dark:bg-sidebar-dark rounded-lg border border-border dark:border-border-dark px-4">
              <Row label="Export workspace">
                <button
                  onClick={() => void handleExport()}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded
                           bg-border dark:bg-border-dark text-text dark:text-text-dark
                           hover:bg-border-dark dark:hover:bg-border transition-colors disabled:opacity-50"
                >
                  {exporting ? 'Exporting…' : 'Export as ZIP'}
                </button>
              </Row>
              <Row label="Import Markdown">
                <button
                  onClick={() => setShowImport('markdown')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded
                           bg-border dark:bg-border-dark text-text dark:text-text-dark
                           hover:bg-border-dark dark:hover:bg-border transition-colors"
                >
                  Import Markdown
                </button>
              </Row>
              <Row label="Import Obsidian vault">
                <button
                  onClick={() => setShowImport('obsidian')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded
                           bg-border dark:bg-border-dark text-text dark:text-text-dark
                           hover:bg-border-dark dark:hover:bg-border transition-colors"
                >
                  Import Obsidian
                </button>
              </Row>
            </div>
          </section>

          {/* About Section */}
          <section className="mb-8">
            <SectionTitle>About</SectionTitle>
            <div className="bg-sidebar dark:bg-sidebar-dark rounded-lg border border-border dark:border-border-dark px-4">
              <Row label="Version">
                <span className="text-sm text-text-muted dark:text-text-muted-dark font-mono">
                  v0.2.0 ({__GIT_HASH__})
                </span>
              </Row>
              <Row label="Keyboard shortcuts">
                <div className="flex gap-2 text-xs text-text-muted dark:text-text-muted-dark">
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-border dark:bg-border-dark">
                      Ctrl+K
                    </kbd>{' '}
                    Search
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-border dark:bg-border-dark">
                      Ctrl+Shift+N
                    </kbd>{' '}
                    New note
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-border dark:bg-border-dark">
                      Ctrl+S
                    </kbd>{' '}
                    Save
                  </span>
                </div>
              </Row>
            </div>
          </section>
        </div>
      </div>
      {showImport && (
        <ImportModal
          initialTab={showImport}
          onClose={() => setShowImport(null)}
          onImported={() => setShowImport(null)}
        />
      )}
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
