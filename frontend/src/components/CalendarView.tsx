import { useEffect, useState, useCallback } from 'react';
import { VscChevronLeft, VscChevronRight } from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';
import type { NoteMetadata } from '../types';
import { listNotes } from '../api';

// Get ISO date string (YYYY-MM-DD) for a Date object in local time
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface Props {
  onClose?: () => void;
}

export function CalendarView({ onClose }: Props) {
  const [today] = useState(() => new Date());
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const openNote = useNoteStore((s) => s.openNote);
  const createNote = useNoteStore((s) => s.createNote);

  useEffect(() => {
    listNotes()
      .then(setNotes)
      .catch(() => {});
  }, []);

  // ESC closes the calendar view
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose?.();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Only show notes whose title or path contains a YYYY-MM-DD date pattern.
  // Notes without an explicit date are not placed on the calendar.
  const DATE_PATTERN = /(\d{4}-\d{2}-\d{2})/;
  const notesByDate: Record<string, NoteMetadata[]> = {};
  for (const note of notes) {
    // Check title for date pattern first
    const titleMatch = DATE_PATTERN.exec(note.title);
    if (titleMatch) {
      const dateStr = titleMatch[1];
      if (!notesByDate[dateStr]) notesByDate[dateStr] = [];
      notesByDate[dateStr].push(note);
      continue;
    }
    // Fall back to checking the path
    const pathMatch = DATE_PATTERN.exec(note.path);
    if (pathMatch) {
      const dateStr = pathMatch[1];
      if (!notesByDate[dateStr]) notesByDate[dateStr] = [];
      notesByDate[dateStr].push(note);
    }
    // Notes without a date pattern are skipped
  }

  // Calendar grid computation
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();

  // Previous month nav
  const prevMonth = useCallback(() => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }, [month]);

  // Next month nav
  const nextMonth = useCallback(() => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }, [month]);

  const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Build grid cells: blanks before month start, then days
  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr });
  }

  const todayStr = toLocalDateStr(today);
  const selectedNotes = selectedDay ? (notesByDate[selectedDay] ?? []) : [];

  const handleCreateForDay = useCallback(async () => {
    if (!selectedDay) return;
    const title = `Note for ${selectedDay}`;
    await createNote(title);
    onClose?.();
  }, [selectedDay, createNote, onClose]);

  return (
    <div className="flex flex-col h-full bg-surface dark:bg-surface-dark">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-border-dark">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded hover:bg-border dark:hover:bg-border-dark transition-colors
                       text-text dark:text-text-dark"
            title="Previous month"
          >
            <VscChevronLeft size={16} />
          </button>
          <h2 className="text-base font-semibold text-text dark:text-text-dark min-w-[160px] text-center">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded hover:bg-border dark:hover:bg-border-dark transition-colors
                       text-text dark:text-text-dark"
            title="Next month"
          >
            <VscChevronRight size={16} />
          </button>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-sm text-text-muted dark:text-text-muted-dark
                       hover:text-text dark:hover:text-text-dark transition-colors"
          >
            Close
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Day of week headers */}
          <div className="grid grid-cols-7 mb-2">
            {DOW_LABELS.map((d) => (
              <div
                key={d}
                className="text-center text-xs font-medium text-text-muted dark:text-text-muted-dark py-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px bg-border dark:bg-border-dark rounded-lg overflow-hidden">
            {cells.map((cell, idx) => {
              if (!cell.day || !cell.dateStr) {
                return (
                  <div
                    key={`blank-${idx}`}
                    className="bg-surface dark:bg-surface-dark min-h-[80px]"
                  />
                );
              }
              const isToday = cell.dateStr === todayStr;
              const isSelected = cell.dateStr === selectedDay;
              const dayNotes = notesByDate[cell.dateStr] ?? [];

              return (
                <div
                  key={cell.dateStr}
                  onClick={() =>
                    setSelectedDay(isSelected ? null : cell.dateStr)
                  }
                  className={`bg-surface dark:bg-surface-dark min-h-[80px] p-1.5 cursor-pointer
                    transition-colors hover:bg-sidebar dark:hover:bg-sidebar-dark
                    ${isSelected ? 'ring-2 ring-inset ring-accent' : ''}
                  `}
                >
                  <div
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1
                      ${
                        isToday
                          ? 'bg-accent text-white'
                          : 'text-text dark:text-text-dark'
                      }`}
                  >
                    {cell.day}
                  </div>
                  <div className="space-y-0.5">
                    {dayNotes.slice(0, 3).map((note) => (
                      <div
                        key={note.id}
                        className="text-[10px] text-accent truncate rounded px-0.5
                                   bg-accent/10 leading-4"
                        title={note.title}
                      >
                        {note.title}
                      </div>
                    ))}
                    {dayNotes.length > 3 && (
                      <div className="text-[10px] text-text-muted dark:text-text-muted-dark">
                        +{dayNotes.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day detail panel */}
        {selectedDay && (
          <div
            className="w-64 border-l border-border dark:border-border-dark p-4 overflow-y-auto
                          bg-sidebar dark:bg-sidebar-dark"
          >
            <h3 className="text-sm font-semibold text-text dark:text-text-dark mb-3">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString(
                undefined,
                {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                },
              )}
            </h3>
            {selectedNotes.length === 0 ? (
              <p className="text-xs text-text-muted dark:text-text-muted-dark mb-3">
                No notes for this day.
              </p>
            ) : (
              <ul className="space-y-1 mb-3">
                {selectedNotes.map((note) => (
                  <li key={note.id}>
                    <button
                      onClick={() => {
                        openNote(note.id);
                        onClose?.();
                      }}
                      className="w-full text-left text-sm text-text dark:text-text-dark
                                 hover:text-accent transition-colors truncate"
                    >
                      {note.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={handleCreateForDay}
              className="w-full px-3 py-1.5 rounded text-xs bg-accent text-white
                         hover:bg-accent-hover transition-colors"
            >
              New note for this day
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
