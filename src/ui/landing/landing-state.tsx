'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type { CategorySlug } from '@/contracts';
import type { LatLng } from '@/shared/geo';

export type VisitorLocation =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'granted'; point: LatLng }
  | { status: 'denied' }
  | { status: 'unavailable' };

/** The pointer in viewport fractions (0–1), written by one passive listener and read inside rAF loops. */
export interface PointerSample {
  x: number;
  y: number;
  active: boolean;
}

interface LandingState {
  activeCategory: CategorySlug | null;
  setActiveCategory: (category: CategorySlug | null) => void;
  highlightedTaskId: string | null;
  setHighlightedTaskId: (id: string | null) => void;
  location: VisitorLocation;
  requestLocation: () => void;
  pointer: MutableRefObject<PointerSample>;
}

const LandingContext = createContext<LandingState | null>(null);

/**
 * One shared state for the landing page, so one action shows everywhere: a category picked in the map's
 * filter tints the canvas and lifts its pins; a task hovered in the list lifts its pin; a shared location
 * sorts what's near. The visitor's location is asked for only when they press the button, and it never
 * leaves the browser.
 */
export function LandingProvider({ children, initialLocation, initialCategory = null }: { children: ReactNode; initialLocation?: LatLng; initialCategory?: CategorySlug | null }) {
  const [activeCategory, setActiveCategory] = useState<CategorySlug | null>(initialCategory);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [location, setLocation] = useState<VisitorLocation>(initialLocation ? { status: 'granted', point: initialLocation } : { status: 'idle' });
  const pointer = useRef<PointerSample>({ x: 0.5, y: 0.35, active: false });

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointer.current.x = event.clientX / Math.max(1, window.innerWidth);
      pointer.current.y = event.clientY / Math.max(1, window.innerHeight);
      pointer.current.active = true;
    };
    const onLeave = () => {
      pointer.current.active = false;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocation({ status: 'unavailable' });
      return;
    }
    setLocation({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation({ status: 'granted', point: { lat: position.coords.latitude, lng: position.coords.longitude } }),
      (error) => setLocation({ status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 12_000 },
    );
  }, []);

  const value = useMemo<LandingState>(
    () => ({ activeCategory, setActiveCategory, highlightedTaskId, setHighlightedTaskId, location, requestLocation, pointer }),
    [activeCategory, highlightedTaskId, location, requestLocation],
  );
  return <LandingContext.Provider value={value}>{children}</LandingContext.Provider>;
}

export function useLanding(): LandingState {
  const state = useContext(LandingContext);
  if (!state) throw new Error('useLanding must be used inside <LandingProvider>.');
  return state;
}

/** For components that also render outside the landing page (they then behave as if nothing is shared). */
export function useOptionalLanding(): LandingState | null {
  return useContext(LandingContext);
}
