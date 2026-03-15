import { useState, useEffect, useRef } from 'react';
import type { AutomationEvent } from '../components/AutomationLog';

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
