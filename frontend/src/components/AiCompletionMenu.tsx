import { useEffect, useRef, useCallback, useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { aiComplete, type AiCompleteResponse } from '../api';

interface Props {
  anchorRect: DOMRect | null;
  onSelect: (completion: string) => void;
  onClose: () => void;
}

export function AiCompletionMenu({ anchorRect, onSelect, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { aiProvider, aiApiKey, aiModel } = useSettingsStore();

  const fetchCompletions = useCallback(async () => {
    if (!aiApiKey && aiProvider !== 'ollama') {
      setSuggestions(['Configure your API key in Settings']);
      return;
    }

    setLoading(true);
    try {
      const response = await aiComplete({
        provider: aiProvider,
        api_key: aiApiKey,
        model: aiModel,
        prompt: 'Suggest 3 short completions for this text. Keep each under 10 words. Return only the suggestions, one per line, no numbering.',
        max_tokens: 150,
        temperature: 0.7,
      }) as AiCompleteResponse;
      
      const lines = response.text.trim().split('\n').filter(l => l.trim());
      setSuggestions(lines.slice(0, 3));
    } catch (err) {
      console.error('AI completion error:', err);
      setSuggestions(['Error fetching completions']);
    } finally {
      setLoading(false);
    }
  }, [aiApiKey, aiProvider, aiModel]);

  useEffect(() => {
    if (anchorRect) {
      fetchCompletions();
    }
  }, [anchorRect, fetchCompletions]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && suggestions[selectedIndex]) {
        e.preventDefault();
        onSelect(suggestions[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [suggestions, selectedIndex, onSelect, onClose]);

  if (!anchorRect) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded-lg shadow-lg py-1 min-w-48"
      style={{
        left: anchorRect.left,
        top: anchorRect.bottom + 4,
      }}
    >
      {loading ? (
        <div className="px-3 py-2 text-sm text-text-muted dark:text-text-muted-dark">
          Loading...
        </div>
      ) : (
        suggestions.map((suggestion, index) => (
          <button
            key={index}
            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
              index === selectedIndex
                ? 'bg-accent text-white'
                : 'text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
            }`}
            onClick={() => onSelect(suggestion)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            {suggestion}
          </button>
        ))
      )}
    </div>
  );
}
