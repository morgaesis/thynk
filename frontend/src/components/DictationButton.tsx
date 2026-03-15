import { useState, useRef, useEffect, useCallback } from 'react';
import { RiMicLine, RiMicFill } from 'react-icons/ri';
import type { Editor as TipTapEditor } from '@tiptap/react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

interface Props {
  editor: TipTapEditor | null;
}

export function DictationButton({ editor }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported] = useState(
    () => !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    if (!editor) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI: any =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript;
          editor.commands.insertContent(transcript);
        }
      }
    };

    recognition.onerror = () => {
      stopRecording();
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [editor, stopRecording]);

  const handleClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Stop recording on Escape key
  useEffect(() => {
    if (!isRecording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopRecording();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, stopRecording]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  if (!isSupported) {
    return (
      <button
        disabled
        title="Dictation not supported in this browser"
        className="p-1.5 rounded text-text-muted dark:text-text-muted-dark opacity-40 cursor-not-allowed"
        aria-label="Dictation not supported"
      >
        <RiMicLine size={16} />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      title={isRecording ? 'Stop dictation (Esc)' : 'Dictation: browser local'}
      aria-label={isRecording ? 'Stop dictation' : 'Start dictation'}
      aria-pressed={isRecording}
      className={`p-1.5 rounded transition-colors ${
        isRecording
          ? 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950 recording-pulse'
          : 'text-text-muted dark:text-text-muted-dark hover:text-text dark:hover:text-text-dark hover:bg-border dark:hover:bg-border-dark'
      }`}
    >
      {isRecording ? <RiMicFill size={16} /> : <RiMicLine size={16} />}
    </button>
  );
}
