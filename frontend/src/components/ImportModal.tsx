import { useRef, useState } from 'react';
import { VscClose, VscCloudUpload } from 'react-icons/vsc';
import { importMarkdown, importObsidian, type ImportResult } from '../api';

type Tab = 'obsidian' | 'markdown';

interface ImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

export function ImportModal({ onClose, onImported }: ImportModalProps) {
  const [tab, setTab] = useState<Tab>('obsidian');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Please select a zip file to import.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res =
        tab === 'obsidian'
          ? await importObsidian(file)
          : await importMarkdown(file);
      setResult(res);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-lg shadow-xl
                   bg-surface dark:bg-surface-dark
                   border border-border dark:border-border-dark"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-border-dark">
          <h2 className="text-base font-semibold text-text dark:text-text-dark">
            Import Notes
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted dark:text-text-muted-dark
                       hover:bg-border dark:hover:bg-border-dark transition-colors"
            aria-label="Close"
          >
            <VscClose size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border dark:border-border-dark">
          {(['obsidian', 'markdown'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setResult(null);
                setError(null);
              }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors
                ${
                  tab === t
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-text-muted dark:text-text-muted-dark hover:text-text dark:hover:text-text-dark'
                }`}
            >
              {t === 'obsidian' ? 'Obsidian Vault' : 'Markdown Folder'}
            </button>
          ))}
        </div>

        {/* Body */}
        <form onSubmit={handleImport} className="px-6 py-5 space-y-4">
          <p className="text-sm text-text-muted dark:text-text-muted-dark">
            {tab === 'obsidian'
              ? 'Supports Obsidian vaults with [[wiki-links]], YAML frontmatter, and attachments. Upload your vault as a .zip file.'
              : 'Upload a .zip file containing .md files. Directory structure will be preserved.'}
          </p>

          {/* File input */}
          <label
            className="flex flex-col items-center gap-2 w-full py-6 px-4 rounded-md
                       border-2 border-dashed border-border dark:border-border-dark
                       hover:border-accent dark:hover:border-accent
                       cursor-pointer transition-colors text-center"
          >
            <VscCloudUpload
              size={24}
              className="text-text-muted dark:text-text-muted-dark"
            />
            <span className="text-sm text-text-muted dark:text-text-muted-dark">
              Click to select a .zip file
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="sr-only"
              onChange={() => {
                setResult(null);
                setError(null);
              }}
            />
          </label>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 rounded-md bg-red-500/10 px-3 py-2">
              {error}
            </p>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-md bg-accent/10 px-3 py-2 space-y-1">
              <p className="text-sm font-medium text-accent">
                Import complete: {result.imported} note
                {result.imported !== 1 ? 's' : ''} imported
                {result.attachments > 0 &&
                  `, ${result.attachments} attachment${result.attachments !== 1 ? 's' : ''} copied`}
              </p>
              {result.errors.length > 0 && (
                <details className="text-xs text-text-muted dark:text-text-muted-dark">
                  <summary className="cursor-pointer">
                    {result.errors.length} warning
                    {result.errors.length !== 1 ? 's' : ''}
                  </summary>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md
                         text-text-muted dark:text-text-muted-dark
                         hover:bg-border dark:hover:bg-border-dark transition-colors"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm rounded-md font-medium
                         bg-accent text-white
                         hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
