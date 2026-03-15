import { useEffect, useState, useCallback, useRef } from 'react';
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

interface MonthKey {
  year: number;
  month: number; // 0-indexed
}

function monthKeyId(mk: MonthKey): string {
  return `${mk.year}-${String(mk.month + 1).padStart(2, '0')}`;
}

function offsetMonth(base: MonthKey, delta: number): MonthKey {
  let m = base.month + delta;
  let y = base.year;
  while (m < 0) { m += 12; y -= 1; }
  while (m > 11) { m -= 12; y += 1; }
  return { year: y, month: m };
}

interface Props {
  onClose?: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface MonthGridProps {
  mk: MonthKey;
  todayStr: string;
  selectedDay: string | null;
  notesByDate: Record<string, NoteMetadata[]>;
  onSelectDay: (dateStr: string) => void;
}

function MonthGrid({ mk, todayStr, selectedDay, notesByDate, onSelectDay }: MonthGridProps) {
  const { year, month } = mk;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr });
  }

  return (
    <>
      {/* Day of week headers */}
      <div className="grid grid-cols-7 mb-1">
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
              onClick={() => onSelectDay(cell.dateStr!)}
              className={`bg-surface dark:bg-surface-dark min-h-[80px] p-1.5 cursor-pointer
                transition-colors hover:bg-sidebar dark:hover:bg-sidebar-dark
                ${isSelected ? 'ring-2 ring-inset ring-accent' : ''}
              `}
            >
              <div
                className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1
                  ${isToday ? 'bg-accent text-white' : 'text-text dark:text-text-dark'}`}
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
    </>
  );
}

export function CalendarView({ onClose }: Props) {
  const [today] = useState(() => new Date());
  const todayStr = toLocalDateStr(today);
  const currentMonth: MonthKey = { year: today.getFullYear(), month: today.getMonth() };

  // Initialize with 2 months before current, current, 3 after
  const [months, setMonths] = useState<MonthKey[]>(() => {
    const result: MonthKey[] = [];
    for (let i = -2; i <= 3; i++) {
      result.push(offsetMonth(currentMonth, i));
    }
    return result;
  });

  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const openNote = useNoteStore((s) => s.openNote);
  const createNote = useNoteStore((s) => s.createNote);

  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  // Guard against double-prepend in the same observer callback cycle
  const isLoadingMore = useRef(false);

  useEffect(() => {
    listNotes().then(setNotes).catch(() => {});
  }, []);

  // ESC closes the calendar view
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose?.(); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Scroll to show "one week before today" on mount
  useEffect(() => {
    if (didInitialScroll.current) return;
    const container = scrollRef.current;
    if (!container) return;

    const currentMonthId = monthKeyId(currentMonth);
    const monthSection = container.querySelector(`[data-month="${currentMonthId}"]`) as HTMLElement | null;
    if (!monthSection) return;

    // Each day cell is ~80px min-height; estimate row height ~ 84px (80 + gap)
    // Calculate which row "one week before today" falls in
    const todayDayOfMonth = today.getDate();
    const oneWeekBefore = Math.max(1, todayDayOfMonth - 7);
    const firstDow = new Date(currentMonth.year, currentMonth.month, 1).getDay();
    const targetCellIndex = firstDow + oneWeekBefore - 1;
    const targetRow = Math.floor(targetCellIndex / 7);
    // Approximate row height
    const rowHeight = 84;
    const offset = monthSection.offsetTop + 40 + targetRow * rowHeight; // 40 for month label
    container.scrollTop = Math.max(0, offset - 60); // small margin from top
    didInitialScroll.current = true;
  });

  // IntersectionObserver to load more months
  useEffect(() => {
    const container = scrollRef.current;
    const topSentinel = topSentinelRef.current;
    const bottomSentinel = bottomSentinelRef.current;
    if (!container || !topSentinel || !bottomSentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (isLoadingMore.current) continue;

          if (entry.target === topSentinel) {
            isLoadingMore.current = true;
            setMonths((prev) => {
              const oldest = prev[0];
              const newMonths: MonthKey[] = [];
              for (let i = 3; i >= 1; i--) {
                newMonths.push(offsetMonth(oldest, -i));
              }
              return [...newMonths, ...prev];
            });
            // Restore scroll position after prepend: save current scrollHeight
            const prevScrollHeight = container.scrollHeight;
            requestAnimationFrame(() => {
              const newScrollHeight = container.scrollHeight;
              container.scrollTop += newScrollHeight - prevScrollHeight;
              isLoadingMore.current = false;
            });
          } else if (entry.target === bottomSentinel) {
            isLoadingMore.current = true;
            setMonths((prev) => {
              const newest = prev[prev.length - 1];
              const newMonths: MonthKey[] = [];
              for (let i = 1; i <= 3; i++) {
                newMonths.push(offsetMonth(newest, i));
              }
              return [...prev, ...newMonths];
            });
            requestAnimationFrame(() => {
              isLoadingMore.current = false;
            });
          }
        }
      },
      { root: container, rootMargin: '200px' },
    );

    observer.observe(topSentinel);
    observer.observe(bottomSentinel);
    return () => observer.disconnect();
  }, []);

  // Build notesByDate index
  const DATE_PATTERN = /(\d{4}-\d{2}-\d{2})/;
  const notesByDate: Record<string, NoteMetadata[]> = {};
  for (const note of notes) {
    const titleMatch = DATE_PATTERN.exec(note.title);
    if (titleMatch) {
      const dateStr = titleMatch[1];
      if (!notesByDate[dateStr]) notesByDate[dateStr] = [];
      notesByDate[dateStr].push(note);
      continue;
    }
    const pathMatch = DATE_PATTERN.exec(note.path);
    if (pathMatch) {
      const dateStr = pathMatch[1];
      if (!notesByDate[dateStr]) notesByDate[dateStr] = [];
      notesByDate[dateStr].push(note);
    }
  }

  const selectedNotes = selectedDay ? (notesByDate[selectedDay] ?? []) : [];

  const handleSelectDay = useCallback((dateStr: string) => {
    setSelectedDay((prev) => (prev === dateStr ? null : dateStr));
  }, []);

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
        <h2 className="text-base font-semibold text-text dark:text-text-dark">
          Calendar
        </h2>
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
        {/* Scrollable calendar area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {/* Top sentinel */}
          <div ref={topSentinelRef} className="h-1" />

          {months.map((mk) => {
            const id = monthKeyId(mk);
            return (
              <section key={id} data-month={id} className="px-4 pb-6">
                {/* Sticky month/year label */}
                <div className="sticky top-0 z-10 bg-surface dark:bg-surface-dark py-2 mb-2">
                  <h3 className="text-sm font-semibold text-text dark:text-text-dark">
                    {MONTH_NAMES[mk.month]} {mk.year}
                  </h3>
                </div>

                <MonthGrid
                  mk={mk}
                  todayStr={todayStr}
                  selectedDay={selectedDay}
                  notesByDate={notesByDate}
                  onSelectDay={handleSelectDay}
                />
              </section>
            );
          })}

          {/* Bottom sentinel */}
          <div ref={bottomSentinelRef} className="h-1" />
        </div>

        {/* Day detail panel */}
        {selectedDay && (
          <div
            className="w-64 border-l border-border dark:border-border-dark p-4 overflow-y-auto
                          bg-sidebar dark:bg-sidebar-dark"
          >
            <h3 className="text-sm font-semibold text-text dark:text-text-dark mb-3">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
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
