'use client';

import { useEffect, useState } from 'react';

/**
 * The time now, again every `everyMs` (a city's hour, "posted 12 min ago"). Null until the page runs: the server's
 * time would be stale by the time anyone reads it, and the first render must match the server's.
 */
export function useNow(everyMs: number): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, everyMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [everyMs]);
  return now;
}
