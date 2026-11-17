'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Season } from '@/shared/seasons';

const SeasonContext = createContext<Season | null>(null);

/** The season the landing is dressed for (HomeScreen decides it: a `?season=` link, or the market's own). */
export function SeasonProvider({ season, children }: { season: Season; children: ReactNode }) {
  return <SeasonContext value={season}>{children}</SeasonContext>;
}

/** The landing's season, or null outside it (callers fall back to the calendar). */
export function useSeason(): Season | null {
  return useContext(SeasonContext);
}
