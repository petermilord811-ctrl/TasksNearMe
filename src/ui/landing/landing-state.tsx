'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type { CategorySlug, MapArea } from '@/contracts';
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

/** Where the task list and map live on the page (the hero's cards scroll here). Defined in a plain module, so
 * server components (the footer's index) can read it too. */
import { MAP_SECTION_ID } from './sections/ids';

export { MAP_SECTION_ID };

/** Who the hero speaks to: someone who needs help (posts tasks), or someone who can help (a helper). */
export type Audience = 'poster' | 'helper';

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
  /** Picks a task on the map itself (its card stays open), or clears the pick; no scrolling. */
  pickTask: (id: string | null) => void;
  /** The task to light up: the one under the pointer, otherwise the picked one. */
  litTaskId: string | null;
  location: VisitorLocation;
  requestLocation: () => void;
  pointer: MutableRefObject<PointerSample>;
  /** The hero's switch: "I need help" or "I can help". */
  audience: Audience;
  setAudience: (audience: Audience) => void;
  /** A neighborhood picked in the hero or the map's explorer (null: the whole market). */
  area: MapArea | null;
  /** Counts picks, so picking the same neighborhood again still flies the map there. */
  areaPicks: number;
  pickArea: (area: MapArea | null) => void;
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
 * press the button, and it never leaves the browser. The hero's switch says who the page speaks to (someone who
 * needs help, or a helper), and a neighborhood picked in the hero or the map's explorer is the same pick: the
 * map flies there and the hero's counts narrow to it.
 */
export function LandingProvider({ children, initialLocation, initialCategory = null }: { children: ReactNode; initialLocation?: LatLng; initialCategory?: CategorySlug | null }) {
  const [selectedCategory, setSelectedCategory] = useState<CategorySlug | null>(initialCategory);
  const [previewCategory, setPreviewCategory] = useState<CategorySlug | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [location, setLocation] = useState<VisitorLocation>(initialLocation ? { status: 'granted', point: initialLocation } : { status: 'idle' });
  const [audience, setAudience] = useState<Audience>('poster');
  const [area, setArea] = useState<{ value: MapArea | null; picks: number }>({ value: null, picks: 0 });
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

  const pickTask = useCallback((id: string | null) => setFocusedTaskId(id), []);
  const pickArea = useCallback((value: MapArea | null) => setArea((current) => ({ value, picks: current.picks + 1 })), []);

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
      pickTask,
      litTaskId: highlightedTaskId ?? focusedTaskId,
      location,
      requestLocation,
      pointer,
      audience,
      setAudience,
      area: area.value,
      areaPicks: area.picks,
      pickArea,
    }),
    [selectedCategory, selectCategory, previewCategory, highlightedTaskId, focusedTaskId, focusTask, pickTask, location, requestLocation, audience, area, pickArea],
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
