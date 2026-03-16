import { useCallback, useState, useEffect, useRef } from 'react';
import { VscArrowLeft, VscAdd, VscTrash } from 'react-icons/vsc';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore, DEFAULT_SHORTCUTS, type AIProvider } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { exportWorkspace, listInvitations, createInvitation, revokeInvitation, type Invitation } from '../api';
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

const AI_PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'ollama', label: 'Ollama (local)' },
];

const AI_MODELS: Record<AIProvider, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
  ],
  ollama: [
    { value: 'llama3.2', label: 'Llama 3.2' },
    { value: 'mistral', label: 'Mistral' },
    { value: 'codellama', label: 'CodeLlama' },
  ],
};

// ── Keyboard Shortcuts rebinding ─────────────────────────────────────────────

function ShortcutsSection({
  shortcuts,
  onSet,
  onReset,
}: {
  shortcuts: Record<string, string>;
  onSet: (action: string, key: string) => void;
  onReset: (action: string) => void;
}) {
  const [rebinding, setRebinding] = useState<string | null>(null);
  const rebindRef = useRef<string | null>(null);

  useEffect(() => {
    rebindRef.current = rebinding;
  });

  useEffect(() => {
    if (!rebinding) return;
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRebinding(null);
        return;
      }
      // Ignore modifier-only keypresses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
      const combo = parts.join('+');
      onSet(rebindRef.current!, combo);
      setRebinding(null);
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [rebinding, onSet]);

  return (
    <section className="mb-8">
      <SectionTitle>Keyboard Shortcuts</SectionTitle>
      <div className="bg-sidebar dark:bg-sidebar-dark rounded-lg border border-border dark:border-border-dark px-4">
        {Object.entries(DEFAULT_SHORTCUTS).map(([action, { label, defaultKey }]) => {
          const currentKey = shortcuts[action] ?? defaultKey;
          const isCustom = Boolean(shortcuts[action]);
          const isRebinding = rebinding === action;
          return (
            <Row key={action} label={label}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRebinding(isRebinding ? null : action)}
                  title={isRebinding ? 'Press new key combo (Esc to cancel)' : 'Click to rebind'}
                  className={`px-2 py-0.5 text-xs rounded font-mono transition-colors
                    ${isRebinding
                      ? 'bg-accent text-white animate-pulse'
                      : 'bg-border dark:bg-border-dark text-text dark:text-text-dark hover:bg-accent/20'
                    }`}
                >
                  {isRebinding ? 'Press key…' : currentKey}
                </button>
                {isCustom && (
                  <button
                    onClick={() => onReset(action)}
                    className="text-xs text-text-muted dark:text-text-muted-dark hover:text-text dark:hover:text-text-dark underline"
                    title="Reset to default"
                  >
                    Reset
                  </button>
                )}
              </div>
            </Row>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-text-muted dark:text-text-muted-dark px-1">
        Click a shortcut to rebind it. Press Esc to cancel.
      </p>
    </section>
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
    shortcuts,
    aiProvider,
    aiApiKey,
    aiModel,
    setFontSize,
    setVimMode,
    setLineHeight,
    setSpellCheck,
    setShortcut,
    resetShortcut,
    setAiProvider,
    setAiApiKey,
    setAiModel,
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
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviting, setInviting] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);

  const isAdmin = authUser?.role === 'owner' || authUser?.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      listInvitations()
        .then(setInvitations)
        .catch(console.error);
    }
  }, [isAdmin]);

  const handleCreateInvitation = useCallback(async () => {
    if (!inviteEmail) return;
    setInviting(true);
    setInvitationError(null);
    try {
      const inv = await createInvitation({ email: inviteEmail, role: inviteRole });
      setInvitations((prev) => [inv, ...prev]);
      setInviteEmail('');
    } catch (e) {
      setInvitationError(e instanceof Error ? e.message : 'Failed to create invitation');
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, inviteRole]);

  const handleRevokeInvitation = useCallback(async (id: string) => {
    try {
      await revokeInvitation(id);
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      console.error('Failed to revoke invitation:', e);
    }
  }, []);

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

          {/* AI Section */}
          <section className="mb-8">
            <SectionTitle>AI Assistant</SectionTitle>
            <div className="bg-sidebar dark:bg-sidebar-dark rounded-lg border border-border dark:border-border-dark px-4">
              <Row label="Provider">
                <RadioGroup
                  options={AI_PROVIDERS}
                  value={aiProvider}
                  onChange={setAiProvider}
                />
              </Row>
              <Row label="API Key">
                <input
                  type="password"
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder={aiProvider === 'ollama' ? 'Leave empty for local' : 'sk-...'}
                  className="w-48 px-2 py-1 text-sm rounded border border-border dark:border-border-dark
                           bg-surface dark:bg-surface-dark text-text dark:text-text-dark"
                />
              </Row>
              <Row label="Model">
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="px-2 py-1 text-sm rounded border border-border dark:border-border-dark
                           bg-surface dark:bg-surface-dark text-text dark:text-text-dark"
                >
                  {AI_MODELS[aiProvider].map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Row>
            </div>
            <p className="mt-1 text-xs text-text-muted dark:text-text-muted-dark px-1">
              Your API key is stored locally and never sent to our servers.
              {aiProvider === 'ollama' && ' Ensure Ollama is running locally on port 11434.'}
            </p>
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

          {/* Team Members Section - Only for Owner/Admin */}
          {(authUser?.role === 'owner' || authUser?.role === 'admin') && (
            <section className="mb-8">
              <SectionTitle>Team Members</SectionTitle>
              <div className="bg-sidebar dark:bg-sidebar-dark rounded-lg border border-border dark:border-border-dark px-4">
                <div className="py-3">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="email"
                      placeholder="Email address"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm rounded border border-border dark:border-border-dark
                               bg-surface dark:bg-surface-dark text-text dark:text-text-dark"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="px-2 py-1 text-sm rounded border border-border dark:border-border-dark
                               bg-surface dark:bg-surface-dark text-text dark:text-text-dark"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => void handleCreateInvitation()}
                      disabled={inviting || !inviteEmail}
                      className="flex items-center gap-1 px-3 py-1 text-xs rounded
                               bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
                    >
                      <VscAdd size={14} />
                      {inviting ? 'Sending...' : 'Invite'}
                    </button>
                  </div>
                  {invitationError && (
                    <p className="text-xs text-red-500 mb-2">{invitationError}</p>
                  )}
                  {invitations.length > 0 && (
                    <div className="space-y-2 mt-3">
                      <p className="text-xs text-text-muted dark:text-text-muted-dark">
                        Pending Invitations
                      </p>
                      {invitations.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between py-1.5 px-2 rounded bg-surface dark:bg-surface-dark"
                        >
                          <div>
                            <span className="text-sm text-text dark:text-text-dark">
                              {inv.email}
                            </span>
                            <span className="text-xs text-text-muted dark:text-text-muted-dark ml-2">
                              ({inv.role})
                            </span>
                          </div>
                          <button
                            onClick={() => void handleRevokeInvitation(inv.id)}
                            className="p-1 text-text-muted dark:text-text-muted-dark hover:text-red-500"
                            title="Revoke invitation"
                          >
                            <VscTrash size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

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

          {/* Keyboard Shortcuts Section */}
          <ShortcutsSection
            shortcuts={shortcuts}
            onSet={setShortcut}
            onReset={resetShortcut}
          />

          {/* About Section */}
          <section className="mb-8">
            <SectionTitle>About</SectionTitle>
            <div className="bg-sidebar dark:bg-sidebar-dark rounded-lg border border-border dark:border-border-dark px-4">
              <Row label="Version">
                <span className="text-sm text-text-muted dark:text-text-muted-dark font-mono">
                  v0.2.0 ({__GIT_HASH__})
                </span>
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
