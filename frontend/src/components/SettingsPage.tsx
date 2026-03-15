import { VscArrowLeft } from 'react-icons/vsc';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';

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

export function SettingsPage() {
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

  const handleBack = () => {
    window.history.back();
  };

  return (
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
            <Row label="Font size">
              <RadioGroup
                options={[
                  { value: 'sm', label: 'Small' },
                  { value: 'md', label: 'Medium' },
                  { value: 'lg', label: 'Large' },
                ]}
                value={fontSize}
                onChange={setFontSize}
              />
            </Row>
            <Row label="Line height">
              <RadioGroup
                options={[
                  { value: 'compact', label: 'Compact' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'relaxed', label: 'Relaxed' },
                ]}
                value={lineHeight}
                onChange={setLineHeight}
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
                  <span className="text-sm text-text-muted dark:text-text-muted-dark">
                    {authUser.display_name ?? authUser.username}
                  </span>
                </Row>
                <Row label="Storage used">
                  <span className="text-sm text-text-muted dark:text-text-muted-dark">
                    {formatBytes(authUser.storage_used)} /{' '}
                    {formatBytes(authUser.storage_limit)}
                  </span>
                </Row>
              </>
            ) : (
              <div className="py-3 text-sm text-text-muted dark:text-text-muted-dark">
                Not signed in.
              </div>
            )}
          </div>
        </section>

        {/* About Section */}
        <section className="mb-8">
          <SectionTitle>About</SectionTitle>
          <div className="bg-sidebar dark:bg-sidebar-dark rounded-lg border border-border dark:border-border-dark px-4">
            <Row label="Version">
              <span className="text-sm text-text-muted dark:text-text-muted-dark font-mono">
                v0.2.0
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
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
