import { useState, useCallback } from 'react';
import {
  VscChevronDown,
  VscChevronRight,
  VscAdd,
  VscClose,
} from 'react-icons/vsc';
import { parseFrontmatter } from '../utils/frontmatter';

interface Props {
  content: string;
  onChange: (props: Record<string, string>) => void;
}

export function PageProperties({ content, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [addingProp, setAddingProp] = useState(false);

  const props = parseFrontmatter(content);
  const propCount = Object.keys(props).length;

  const handleValueChange = useCallback(
    (key: string, value: string) => {
      const updated = { ...props, [key]: value };
      onChange(updated);
    },
    [props, onChange],
  );

  const handleDeleteProp = useCallback(
    (key: string) => {
      const updated = { ...props };
      delete updated[key];
      onChange(updated);
    },
    [props, onChange],
  );

  const handleAddProp = useCallback(() => {
    const key = newKey.trim();
    if (!key) return;
    const updated = { ...props, [key]: '' };
    onChange(updated);
    setNewKey('');
    setAddingProp(false);
  }, [newKey, props, onChange]);

  const handleAddPropKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddProp();
      } else if (e.key === 'Escape') {
        setAddingProp(false);
        setNewKey('');
      }
    },
    [handleAddProp],
  );

  // Determine field type from value
  function fieldType(value: string): 'boolean' | 'date' | 'text' {
    if (value === 'true' || value === 'false') return 'boolean';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    return 'text';
  }

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-text-muted dark:text-text-muted-dark
                   hover:text-text dark:hover:text-text-dark transition-colors mb-1"
      >
        {expanded ? (
          <VscChevronDown size={12} />
        ) : (
          <VscChevronRight size={12} />
        )}
        <span>
          {propCount > 0 ? `Properties (${propCount})` : 'Properties'}
        </span>
      </button>

      {expanded && (
        <div
          className="rounded-lg border border-border dark:border-border-dark
                        bg-sidebar dark:bg-sidebar-dark p-3 space-y-2 mb-4"
        >
          {Object.entries(props).map(([key, value]) => {
            const type = fieldType(value);
            return (
              <div key={key} className="flex items-center gap-2 group">
                <span
                  className="text-xs font-medium text-text-muted dark:text-text-muted-dark
                                 w-28 shrink-0 truncate"
                  title={key}
                >
                  {key}
                </span>
                {type === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={value === 'true'}
                    onChange={(e) =>
                      handleValueChange(
                        key,
                        e.target.checked ? 'true' : 'false',
                      )
                    }
                    className="rounded accent-accent"
                  />
                ) : type === 'date' ? (
                  <input
                    type="date"
                    value={value}
                    onChange={(e) => handleValueChange(key, e.target.value)}
                    className="flex-1 text-xs bg-transparent border border-border dark:border-border-dark
                               rounded px-2 py-0.5 text-text dark:text-text-dark
                               focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                ) : (
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handleValueChange(key, e.target.value)}
                    className="flex-1 text-xs bg-transparent border border-border dark:border-border-dark
                               rounded px-2 py-0.5 text-text dark:text-text-dark
                               focus:outline-none focus:ring-1 focus:ring-accent"
                    placeholder="value"
                  />
                )}
                <button
                  onClick={() => handleDeleteProp(key)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded
                             text-text-muted dark:text-text-muted-dark
                             hover:text-red-500 transition-all"
                  title={`Remove ${key}`}
                >
                  <VscClose size={12} />
                </button>
              </div>
            );
          })}

          {/* Add property */}
          {addingProp ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={handleAddPropKeyDown}
                onBlur={() => {
                  if (!newKey.trim()) {
                    setAddingProp(false);
                  }
                }}
                placeholder="property name"
                className="flex-1 text-xs bg-transparent border border-accent rounded px-2 py-0.5
                           text-text dark:text-text-dark focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                onClick={handleAddProp}
                className="text-xs px-2 py-0.5 rounded bg-accent text-white hover:bg-accent-hover transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAddingProp(false);
                  setNewKey('');
                }}
                className="text-xs text-text-muted dark:text-text-muted-dark hover:text-text dark:hover:text-text-dark"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingProp(true)}
              className="flex items-center gap-1 text-xs text-text-muted dark:text-text-muted-dark
                         hover:text-text dark:hover:text-text-dark transition-colors"
            >
              <VscAdd size={12} />
              Add property
            </button>
          )}
        </div>
      )}
    </div>
  );
}
