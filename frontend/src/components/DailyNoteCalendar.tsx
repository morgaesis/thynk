import { useState, useMemo } from 'react';
import { VscChevronLeft, VscChevronRight } from 'react-icons/vsc';
import { useNoteStore } from '../stores/noteStore';

function padTwo(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${padTwo(m)}-${padTwo(d)}`;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
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

export function DailyNoteCalendar() {
  const notes = useNoteStore((s) => s.notes);
  const openNote = useNoteStore((s) => s.openNote);
  const createNote = useNoteStore((s) => s.createNote);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1); // 1-based

  // Build a set of dates that have daily notes.
  const dailyDates = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      const match = n.path.match(/^daily\/(\d{4}-\d{2}-\d{2})\.md$/);
      if (match) set.add(match[1]);
    }
    return set;
  }, [notes]);

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayClick = async (day: number) => {
    const dateStr = formatDate(viewYear, viewMonth, day);
    const path = `daily/${dateStr}.md`;
    const existing = notes.find((n) => n.path === path);
    if (existing) {
      await openNote(existing.id);
    } else {
      await createNote(dateStr, path);
    }
  };

  // Build calendar grid.
  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

  const todayStr = formatDate(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate(),
  );

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete final row.
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="px-3 pb-3">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="p-1 rounded text-text-muted dark:text-text-muted-dark
                     hover:bg-border dark:hover:bg-border-dark transition-colors"
        >
          <VscChevronLeft size={12} />
        </button>
        <span className="text-xs font-medium text-text dark:text-text-dark">
          {MONTHS[viewMonth - 1]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="p-1 rounded text-text-muted dark:text-text-muted-dark
                     hover:bg-border dark:hover:bg-border-dark transition-colors"
        >
          <VscChevronRight size={12} />
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] text-text-muted dark:text-text-muted-dark"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={idx} />;
          }
          const dateStr = formatDate(viewYear, viewMonth, day);
          const hasNote = dailyDates.has(dateStr);
          const isToday = dateStr === todayStr;

          return (
            <button
              key={idx}
              onClick={() => handleDayClick(day)}
              title={dateStr}
              className={`relative text-[11px] rounded py-0.5 transition-colors
                ${isToday ? 'font-bold text-accent' : 'text-text dark:text-text-dark'}
                hover:bg-border dark:hover:bg-border-dark`}
            >
              {day}
              {hasNote && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
