'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type { CategorySlug, MapArea, MapHome } from '@/contracts';
import { distanceMiles, type LatLng } from '@/shared/geo';

export type VisitorLocation =
  | { status: 'idle' }
  | { status: 'locating' }
  /**
   * `accuracy`: how sure the browser is, in meters (the map draws it as a soft circle). `source`: the device's own
   * location, or a signed-in helper's home neighborhood (`areaName`; its center, never the address).
   */
  | { status: 'granted'; point: LatLng; accuracy?: number; source?: 'device' | 'home'; areaName?: string }
  | { status: 'denied' }
  | { status: 'unavailable' };

/** A new fix closer than this to the last one (miles, about 25 m) doesn't move anything. */
const LOCATION_JITTER_MILES = 0.015;
/** The page asked for the location by itself once in this visit (a "Not now" isn't asked again). */
const AUTO_ASKED_KEY = 'tnm-location-asked';

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
  /**
   * The visitor asked for their location (a press): asks the browser the first time, and once it's known, the map
   * goes there (`locatePicks` counts these, like `areaPicks`).
   */
  requestLocation: () => void;
  /** Counts the visitor's "show me where I am" presses that found them, so the map flies there each time. */
  locatePicks: number;
  /**
   * "Where I am now" (the map's locate button): the device's location even when the map started from a helper's home
   * neighborhood. Asks the browser if needed; once it's found, the map goes there.
   */
  locateDevice: () => void;
  /** A press is waiting for the browser's answer (the buttons spin). */
  locating: boolean;
  /** The last press couldn't get the device's location (the map keeps the home neighborhood if there is one). */
  locateIssue: 'denied' | 'unavailable' | null;
  /** A signed-in helper's home neighborhood, when they have one: the map's starting place instead of the device's. */
  home: MapHome | null;
  /**
   * The visitor has reached the map: find them without a press. Already allowed, it's silent (and happens as the
   * page opens anyway); not decided yet, the browser asks once per visit; refused, nothing happens. A failure here
   * says nothing (only a press explains one).
   */
  autoLocate: () => void;
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

/** Marks where the map has arrived on the page (its pinned camera has pulled back): scrolling to the map lands here. */
export const MAP_LANDED_ATTRIBUTE = 'data-map-landed';

/**
 * Scrolls to the map, landed (wide screens: past its pinned arrival, so the city view and the explorer are there),
 * or to its section's start where there's no pinned arrival (phones).
 */
export function scrollToMap(): void {
  const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
  const landed = document.querySelector<HTMLElement>(`[${MAP_LANDED_ATTRIBUTE}]`);
  (landed ?? document.getElementById(MAP_SECTION_ID))?.scrollIntoView?.({ behavior, block: 'start' });
}

/** The browser's answer so far on sharing the location ('unknown': it can't say, e.g. no Permissions API). */
async function locationPermission(): Promise<{ state: 'granted' | 'prompt' | 'denied' | 'unknown'; status?: PermissionStatus }> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return { state: 'unknown' };
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return { state: status.state, status };
  } catch {
    return { state: 'unknown' };
  }
}

function askedThisVisit(): boolean {
  try {
    return window.sessionStorage.getItem(AUTO_ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

function markAsked(): void {
  try {
    window.sessionStorage.setItem(AUTO_ASKED_KEY, '1');
  } catch {
    /* storage blocked: it may ask again next time */
  }
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
export function LandingProvider({ children, initialLocation, initialCategory = null, home = null }: { children: ReactNode; initialLocation?: LatLng; initialCategory?: CategorySlug | null; home?: MapHome | null }) {
  const [selectedCategory, setSelectedCategory] = useState<CategorySlug | null>(initialCategory);
  const [previewCategory, setPreviewCategory] = useState<CategorySlug | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  // A helper's home neighborhood stands in for the device's location: the page doesn't ask the browser by itself.
  const homeLat = home?.point.lat;
  const homeLng = home?.point.lng;
  const homeName = home?.areaName;
  const homeLocation = useMemo<VisitorLocation | null>(
    () => (homeLat !== undefined && homeLng !== undefined ? { status: 'granted', point: { lat: homeLat, lng: homeLng }, source: 'home', areaName: homeName } : null),
    [homeLat, homeLng, homeName],
  );
  const homeValue = useMemo<MapHome | null>(() => (homeLat !== undefined && homeLng !== undefined ? { areaName: homeName ?? '', point: { lat: homeLat, lng: homeLng } } : null), [homeLat, homeLng, homeName]);
  const [location, setLocation] = useState<VisitorLocation>(initialLocation ? { status: 'granted', point: initialLocation, source: 'device' } : (homeLocation ?? { status: 'idle' }));
  const [locating, setLocating] = useState(false);
  const [locateIssue, setLocateIssue] = useState<'denied' | 'unavailable' | null>(null);
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
    scrollToMap();
  }, []);

  const pickTask = useCallback((id: string | null) => setFocusedTaskId(id), []);
  const pickArea = useCallback((value: MapArea | null) => setArea((current) => ({ value, picks: current.picks + 1 })), []);

  // ---- Where the visitor is: found once they've reached the map (or at once if they've allowed it before), kept
  // current while the page is open (a walk across town moves the dot), and never sent anywhere ----
  const [locatePicks, setLocatePicks] = useState(0);
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);
  const watchId = useRef<number | null>(null);
  /** A press is waiting for the next fix (then the map goes there). */
  const pressWaiting = useRef(false);
  const autoTried = useRef(Boolean(initialLocation) || homeLocation !== null);
  const homeRef = useRef(homeLocation);
  useEffect(() => {
    homeRef.current = homeLocation;
  }, [homeLocation]);

  const stopWatching = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined') navigator.geolocation?.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const watch = useCallback(
    (source: 'auto' | 'press') => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        if (source === 'press') setLocation({ status: 'unavailable' });
        return;
      }
      if (source === 'press') {
        pressWaiting.current = true;
        setLocating(true);
        setLocateIssue(null);
        // Only a press says it's looking (an automatic try waits quietly, maybe behind the browser's question).
        if (locationRef.current.status !== 'granted') setLocation({ status: 'locating' });
      }
      if (watchId.current !== null) return;
      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const point = { lat: position.coords.latitude, lng: position.coords.longitude };
          const accuracy = Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : undefined;
          setLocation((current) => {
            if (current.status === 'granted' && current.source !== 'home' && distanceMiles(current.point, point) < LOCATION_JITTER_MILES && current.accuracy === accuracy) return current;
            return { status: 'granted', point, accuracy, source: 'device' };
          });
          if (pressWaiting.current) {
            pressWaiting.current = false;
            setLocating(false);
            setLocatePicks((count) => count + 1);
          }
        },
        (error) => {
          const press = pressWaiting.current;
          pressWaiting.current = false;
          setLocating(false);
          // With a home neighborhood, the map keeps it; a press still says why the device's place didn't come.
          const fallback = homeRef.current;
          if (error.code === error.PERMISSION_DENIED) {
            stopWatching();
            if (press) setLocateIssue('denied');
            setLocation(fallback ?? (press ? { status: 'denied' } : { status: 'idle' }));
            return;
          }
          // A slow or failed fix: a known place stays (the watch carries on); otherwise a press says so, and a later
          // press can try again.
          if (locationRef.current.status === 'granted' && locationRef.current.source !== 'home') return;
          stopWatching();
          if (press) setLocateIssue('unavailable');
          setLocation(fallback ?? (press ? { status: 'unavailable' } : { status: 'idle' }));
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
      );
    },
    [stopWatching],
  );

  const requestLocation = useCallback(() => {
    // Already known (the device's place, or the home neighborhood): the map goes there (again).
    if (locationRef.current.status === 'granted') {
      setLocatePicks((count) => count + 1);
      return;
    }
    watch('press');
  }, [watch]);

  const locateDevice = useCallback(() => {
    const current = locationRef.current;
    if (current.status === 'granted' && current.source !== 'home') {
      setLocatePicks((count) => count + 1);
      return;
    }
    watch('press');
  }, [watch]);

  // Allowed before (on an earlier visit): found as the page opens, with no question. The browser's answer can also
  // change while the page is open (its site settings).
  useEffect(() => {
    // A helper's home neighborhood is where the map starts: the device isn't asked by itself (only "where I am now").
    if (initialLocation || homeLocation) return;
    let cancelled = false;
    let status: PermissionStatus | undefined;
    const onChange = () => {
      if (!status) return;
      if (status.state === 'granted') watch('auto');
      else if (status.state === 'denied') {
        stopWatching();
        setLocation((current) => (current.status === 'granted' ? { status: 'idle' } : current));
      }
    };
    void locationPermission().then((answer) => {
      if (cancelled) return;
      status = answer.status;
      status?.addEventListener?.('change', onChange);
      if (answer.state === 'granted') {
        autoTried.current = true;
        watch('auto');
      }
    });
    return () => {
      cancelled = true;
      status?.removeEventListener?.('change', onChange);
    };
  }, [initialLocation, homeLocation, watch, stopWatching]);
  useEffect(() => stopWatching, [stopWatching]);

  const autoLocate = useCallback(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    if (locationRef.current.status !== 'idle') return;
    void locationPermission().then((answer) => {
      if (answer.state === 'denied' || answer.state === 'unknown') return;
      if (answer.state === 'prompt') {
        if (askedThisVisit()) return;
        markAsked();
      }
      watch('auto');
    });
  }, [watch]);

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
      locatePicks,
      locateDevice,
      locating,
      locateIssue,
      home: homeValue,
      autoLocate,
      pointer,
      audience,
      setAudience,
      area: area.value,
      areaPicks: area.picks,
      pickArea,
    }),
    [selectedCategory, selectCategory, previewCategory, highlightedTaskId, focusedTaskId, focusTask, pickTask, location, requestLocation, locatePicks, locateDevice, locating, locateIssue, homeValue, autoLocate, audience, area, pickArea],
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
