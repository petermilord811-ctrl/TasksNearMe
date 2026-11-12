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

/** Where the task list and map live on the page (the hero's cards scroll here). */
export const MAP_SECTION_ID = 'tasks-near-you';

interface LandingState {
  /** The category picked with a click (the map's filter): it stays until another click. */
  selectedCategory: CategorySlug | null;
  selectCategory: (category: CategorySlug | null) => void;
  /** A category being pointed at or focused somewhere on the page: a preview that never changes the filter. */
  previewCategory: CategorySlug | null;
  setPreviewCategory: (category: CategorySlug | null) => void;
  /** What tints the page: the preview while there is one, otherwise the picked category. */
  activeCategory: CategorySlug | null;
  /** The task under the pointer (map or list). */
  highlightedTaskId: string | null;
  setHighlightedTaskId: (id: string | null) => void;
  /** A task picked with a click elsewhere (the hero's cards): it stays lit until another pick. */
  focusedTaskId: string | null;
  /** Scrolls to the map and lights the task there; shows every category if the filter hides it. */
  focusTask: (task: { id: string; categorySlug: CategorySlug }) => void;
  /** The task to light up: the one under the pointer, otherwise the picked one. */
  litTaskId: string | null;
  location: VisitorLocation;
  requestLocation: () => void;
  pointer: MutableRefObject<PointerSample>;
}

const LandingContext = createContext<LandingState | null>(null);

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * One shared state for the landing page, so one action shows everywhere. A click picks: a category in the
 * map's filter narrows the list, flies the map to those tasks, and tints the hero; a task card in the hero
 * scrolls to the map and lights its pin and row. Pointing previews: hovering a category anywhere tints the
 * page and quiets other pins without touching the filter. The visitor's location is asked for only when they
 * press the button, and it never leaves the browser.
 */
export function LandingProvider({ children, initialLocation, initialCategory = null }: { children: ReactNode; initialLocation?: LatLng; initialCategory?: CategorySlug | null }) {
  const [selectedCategory, setSelectedCategory] = useState<CategorySlug | null>(initialCategory);
  const [previewCategory, setPreviewCategory] = useState<CategorySlug | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
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

  const selectCategory = useCallback((category: CategorySlug | null) => {
    setSelectedCategory(category);
    // A new filter starts fresh: the picked task may not be in it.
    setFocusedTaskId(null);
  }, []);

  const focusTask = useCallback((task: { id: string; categorySlug: CategorySlug }) => {
    setSelectedCategory((current) => (current === null || current === task.categorySlug ? current : null));
    setFocusedTaskId(task.id);
    document.getElementById(MAP_SECTION_ID)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
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
    () => ({
      selectedCategory,
      selectCategory,
      previewCategory,
      setPreviewCategory,
      activeCategory: previewCategory ?? selectedCategory,
      highlightedTaskId,
      setHighlightedTaskId,
      focusedTaskId,
      focusTask,
      litTaskId: highlightedTaskId ?? focusedTaskId,
      location,
      requestLocation,
      pointer,
    }),
    [selectedCategory, selectCategory, previewCategory, highlightedTaskId, focusedTaskId, focusTask, location, requestLocation],
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
