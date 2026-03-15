import { useEffect, useState, useRef, useCallback } from 'react';
import type { Editor as TipTapEditor } from '@tiptap/react';

interface Props {
  editor: TipTapEditor | null;
}

export function ReadAloudButton({ editor }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Stop when component unmounts
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Stop when editor note changes
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [editor]);

  const handleToggle = useCallback(() => {
    if (!editor || !supported) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    // Extract plain text from editor
    const text = editor.state.doc.textContent;
    if (!text.trim()) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [editor, speaking, supported]);

  if (!supported) return null;

  return (
    <button
      onClick={handleToggle}
      title="Read aloud (browser local)"
      aria-label={speaking ? 'Stop reading' : 'Read aloud'}
      className={`p-1 rounded transition-colors text-xs flex items-center gap-1
        ${
          speaking
            ? 'text-accent bg-accent/10'
            : 'text-text-muted dark:text-text-muted-dark hover:text-text dark:hover:text-text-dark hover:bg-border dark:hover:bg-border-dark'
        }`}
    >
      {speaking ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"/>
          <rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
      )}
    </button>
  );
}
