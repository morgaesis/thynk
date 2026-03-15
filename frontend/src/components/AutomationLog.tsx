import { useState, useEffect, useRef } from 'react';
import { VscSymbolEvent } from 'react-icons/vsc';

export interface AutomationEvent {
  id: string;
  type: string;
  title: string;
  status: string;
  timestamp: number;
}

interface Props {
  events: AutomationEvent[];
}

export function AutomationLog({ events }: Props) {
  const [expanded, setExpanded] = useState(false);
  const recentCount = events.length;

  if (recentCount === 0) return null;

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-semibold
                   text-text-muted dark:text-text-muted-dark uppercase tracking-wider
                   hover:text-text dark:hover:text-text-dark transition-colors"
      >
        <VscSymbolEvent size={12} />
        Automations
        <span className="ml-1 px-1 py-0.5 rounded text-[10px] bg-accent/20 text-accent font-medium normal-case">
          {recentCount}
        </span>
        <span className="ml-auto text-[10px] normal-case font-normal">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <ul className="px-3 pb-2 space-y-1">
          {events.slice(0, 5).map((ev) => (
            <li
              key={ev.id}
              className="text-xs text-text-muted dark:text-text-muted-dark
                         flex items-start gap-1.5 py-0.5"
            >
              <VscSymbolEvent
                size={11}
                className="shrink-0 mt-0.5 text-accent"
              />
              <span>
                <span className="font-medium text-text dark:text-text-dark">
                  {ev.title}
                </span>{' '}
                → {ev.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Hook that collects status_changed automation events from the WS event stream. */
export function useAutomationEvents(maxEvents = 10) {
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const listenerRef = useRef<((ev: CustomEvent) => void) | null>(null);

  useEffect(() => {
    const handler = (ev: CustomEvent) => {
      const { title, status } = ev.detail as { title: string; status: string };
      setEvents((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          type: 'status_changed',
          title,
          status,
          timestamp: Date.now(),
        },
        ...prev.slice(0, maxEvents - 1),
      ]);
    };
    listenerRef.current = handler;
    window.addEventListener('thynk:automation', handler as EventListener);
    return () => {
      window.removeEventListener('thynk:automation', handler as EventListener);
    };
  }, [maxEvents]);

  return events;
}
