'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { LandingHandlers } from '@/contracts';

const HandlersContext = createContext<LandingHandlers>({});

/**
 * The landing page's handlers (`LandingHandlers`), given by its route around `HomeScreen`, so the hero's
 * assistant can reach them without every section passing them down. Previews give a stand-in; without one the
 * assistant falls back to what needs no handler.
 */
export function LandingHandlersProvider({ handlers, children }: { handlers: LandingHandlers; children: ReactNode }) {
  return <HandlersContext.Provider value={handlers}>{children}</HandlersContext.Provider>;
}

export function useLandingHandlers(): LandingHandlers {
  return useContext(HandlersContext);
}
