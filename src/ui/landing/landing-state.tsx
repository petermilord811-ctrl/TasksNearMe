'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type { CategorySlug, LandingCity, MapArea, MapCity, MapHome, WaitingPlace } from '@/contracts';
import { distanceMiles, type LatLng } from '@/shared/geo';
import { useLandingHandlers } from './landing-handlers';
import { cityAt, insideServiceArea, nearestCity, waitingPlaceNear } from './map/map-math';

export type VisitorLocation =
  | { status: 'idle' }
  | { status: 'locating' }
  /**
   * `accuracy`: how sure the browser is, in meters (the map draws it as a soft circle). `source`: the device's own
   * location, or a signed-in helper's home neighborhood (`areaName`; its center, never the address).
   */
  | { status: 'granted'; point: LatLng; accuracy?: number; source?: 'device' | 'home'; areaName?: string }
  /** The browser refused: location is blocked for the site (its settings can allow it again). */
  | { status: 'denied' }
  /** The browser's question was closed without an answer: it can be asked again (the card invites the visitor). */
  | { status: 'dismissed' }
  | { status: 'unavailable' };

/**
 * The visitor (their device, or a helper's home area) is in no open city (owner, 2026-11-24: "Now I am in Austin, but
 * you still show Gainesville"): where they are, the place people wait for there, if any (its name, and how many wait),
 * and the nearest open city. Worked out on the device: the location goes nowhere.
 */
export interface AwayPlace {
  point: LatLng;
  source: 'device' | 'home';
  place: WaitingPlace | null;
  nearest: { city: MapCity; miles: number } | null;
}

/** A new fix closer than this to the last one (miles, about 25 m) doesn't move anything. */
const LOCATION_JITTER_MILES = 0.015;
/** A helper's device this far from their home area (miles), or in another city, is on a trip: the map follows it. */
const HOME_TRIP_MILES = 25;
/** A refusal this soon after a press (ms) came without a question (the browser stopped asking): blocked, not dismissed. */
const UNASKED_REFUSAL_MS = 400;
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

/**
 * Why the map moves to another city: the visitor picked it (remembered for next time), their location falls in it (the
 * device worked that out; nothing is remembered), or a task of the page's own city asked for it (the hero's town).
 */
export type CityMove = 'pick' | 'location' | 'page';

/** A switch to another city that didn't work: which city, and why (`LandingCityResult`). */
export interface CityIssue {
  slug: string;
  code: 'not_found' | 'unavailable';
}

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
  /**
   * A signed-in helper's home neighborhood, when they have one: the map's starting place instead of the device's. If
   * the browser already shares the device's place, it's watched quietly: far from home (another city, a trip), the map
   * follows the device, and `backToHome` returns.
   */
  home: MapHome | null;
  /** Back to the home neighborhood (and it stays, wherever the device goes, until "where I am now"). */
  backToHome: () => void;
  /** The visitor is in no open city: their place, the waiting there, and the nearest open city. */
  away: AwayPlace | null;
  /**
   * The open city the visitor's location is in, while the map shows another and didn't move there by itself (a city
   * picked on an earlier visit, or the page's city brought back for one of its tasks): the card offers it.
   */
  cityHere: MapCity | null;
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
  /**
   * The city the map, its explorer and the hero's market line show now: the one the page was drawn for, or one the
   * visitor switched to (owner, 2026-11-23: "This platform is not for only Gainesville").
   */
  city: LandingCity;
  /** Every city open or opening, alphabetical (the switcher). */
  cities: MapCity[];
  /** The city the page was drawn for: the hero's town and the sections below the map are about it. */
  pageCitySlug: string;
  /** Cities can be switched in place (the route gave a way to load one; previews link to each city's page instead). */
  canSwitchCity: boolean;
  /** The city being loaded, while it loads. */
  cityLoading: string | null;
  /** The last switch that didn't work. */
  cityIssue: CityIssue | null;
  /** The map moved to the visitor's own city by itself: the city it showed before (the note offers to go back). */
  cityMovedFrom: MapCity | null;
  /** Shows another city: its tasks, neighborhoods and service area, in place. */
  switchCity: (slug: string, how: CityMove) => void;
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

/** A helper's device away from their home neighborhood (another city, or a trip): the map follows the device. */
function onTrip(home: LatLng, device: LatLng, cities: readonly MapCity[]): boolean {
  return distanceMiles(home, device) > HOME_TRIP_MILES || cityAt(cities, home)?.slug !== cityAt(cities, device)?.slug;
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
 *
 * The map shows one city at a time (`city`): the one the page was drawn for, the one the visitor's location falls in
 * (worked out here: only that city's slug is asked for, through the route's `onLoadCity`), or one picked in the
 * map's switcher (remembered, and the page is drawn again for it, so the hero and the sections follow). A city the
 * location found changes the map only: the hero and the sections below stay about the page's city, and a task or a
 * neighborhood of theirs, picked while the map shows another city, brings the map back first. A visitor in no open
 * city (`away`) is shown their own area once, with the place's name and how many people wait there; a city picked
 * before stays put, and the card offers the visitor's own city or area instead.
 */
export function LandingProvider({
  children,
  initialCity,
  cityPicked = false,
  initialLocation,
  initialCategory = null,
  home = null,
}: {
  children: ReactNode;
  /** The city the page was drawn for (its market and map). */
  initialCity: LandingCity;
  /** The visitor picked that city on an earlier visit: their location doesn't move the map away from it. */
  cityPicked?: boolean;
  initialLocation?: LatLng;
  initialCategory?: CategorySlug | null;
  home?: MapHome | null;
}) {
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
  // "Can help" first (owner, 2026-11-22: "Make I can help as default"); "Need help" is one tap away.
  const [audience, setAudience] = useState<Audience>('helper');
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

  // ---- The city: the page's own, or one the visitor switched to ----
  const { onLoadCity } = useLandingHandlers();
  // The page's own city (the hero's town and the sections below are about it), and the city the map shows.
  const [pageCity, setPageCity] = useState<LandingCity>(initialCity);
  const [city, setCity] = useState<LandingCity>(initialCity);
  const cityRef = useRef(city);
  useEffect(() => {
    cityRef.current = city;
  }, [city]);
  const [cityLoading, setCityLoading] = useState<string | null>(null);
  const [cityIssue, setCityIssue] = useState<CityIssue | null>(null);
  const [cityMovedFrom, setCityMovedFrom] = useState<MapCity | null>(null);
  /** The visitor picked the page's city on an earlier visit: their location doesn't move the map away from it (the card
   * offers their own city instead). */
  const pickedEarlier = useRef(cityPicked);
  /** The visitor picked a city in this visit: they know where they are, so the map stays and nothing is offered. */
  const pickedNow = useRef(false);
  /** Each request's number: an answer that comes after a newer request is dropped. */
  const cityTicket = useRef(0);
  /** A neighborhood of the page's city picked (the hero, the coverage section) while the map showed another city. */
  const pendingArea = useRef<MapArea | null>(null);
  // A pick is remembered in a cookie, and setting it draws the page again on the server for the picked city: the
  // page's city follows, and the map shows it (it's the city just picked).
  if (initialCity.market.slug !== pageCity.market.slug) {
    setPageCity(initialCity);
    setCity(initialCity);
    setCityMovedFrom(null);
  }
  const cities = city.map.cities.length > 0 ? city.map.cities : pageCity.map.cities;
  const switchCity = useCallback(
    (slug: string, how: CityMove) => {
      if (how === 'pick') pickedNow.current = true;
      const current = cityRef.current;
      const sameCity = slug === current.market.slug;
      // Already there: a pick is still remembered (the cookie), and a note about having moved goes.
      if (sameCity && how !== 'pick') return;
      if (!onLoadCity) return;
      cityTicket.current += 1;
      const ticket = cityTicket.current;
      if (!sameCity) setCityLoading(slug);
      setCityIssue(null);
      void onLoadCity({ slug, remember: how === 'pick' })
        .then((result) => {
          if (ticket !== cityTicket.current) return;
          setCityLoading(null);
          if (!result.ok) {
            if (!sameCity) setCityIssue({ slug, code: result.code });
            return;
          }
          if (sameCity) {
            setCityMovedFrom(null);
            return;
          }
          const from = current.map.cities.find((item) => item.slug === current.market.slug) ?? null;
          setCity(result.city);
          // Another city's neighborhoods: the pick and the lit tasks were the last city's. A task of the page's own city
          // (the hero's town) stays picked: it's why the map came back.
          const nextArea = how === 'page' ? pendingArea.current : null;
          pendingArea.current = null;
          setArea((value) => ({ value: nextArea, picks: value.picks + 1 }));
          setHighlightedTaskId(null);
          if (how !== 'page') setFocusedTaskId(null);
          setCityMovedFrom(how === 'location' ? from : null);
        })
        .catch(() => {
          if (ticket !== cityTicket.current) return;
          setCityLoading(null);
          if (!sameCity) setCityIssue({ slug, code: 'unavailable' });
        });
    },
    [onLoadCity],
  );

  const focusTask = useCallback(
    (task: { id: string; categorySlug: CategorySlug }) => {
      setSelectedCategory((current) => (current === null || current === task.categorySlug ? current : null));
      setFocusedTaskId(task.id);
      // A task of the page's own city (the hero's town) while the map shows another: back to the page's city.
      const current = cityRef.current;
      if (current.market.slug !== pageCity.market.slug && !current.map.pins.some((pin) => pin.id === task.id)) switchCity(pageCity.market.slug, 'page');
      scrollToMap();
    },
    [pageCity.market.slug, switchCity],
  );

  const pickTask = useCallback((id: string | null) => setFocusedTaskId(id), []);
  const pickArea = useCallback(
    (value: MapArea | null) => {
      // A neighborhood of the page's own city (the hero's market line, the coverage section) while the map shows another
      // city: back to the page's city first, then there.
      const current = cityRef.current;
      if (value && current.market.slug !== pageCity.market.slug && !current.map.areas.some((item) => item.name === value.name) && pageCity.map.areas.some((item) => item.name === value.name)) {
        pendingArea.current = value;
        switchCity(pageCity.market.slug, 'page');
        return;
      }
      setArea((previous) => ({ value, picks: previous.picks + 1 }));
    },
    [pageCity, switchCity],
  );

  // ---- Where the visitor is: found once they've reached the map (or at once if they've allowed it before), kept
  // current while the page is open (a walk across town moves the dot), and never sent anywhere ----
  const [locatePicks, setLocatePicks] = useState(0);
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);
  const watchId = useRef<number | null>(null);
  /** A press is waiting for the next fix (then the map goes there), and when it was made. */
  const pressWaiting = useRef(false);
  const pressedAt = useRef(0);
  /** The device's last fix: a press while the device is already watched (quietly, behind a home) answers with it. */
  const deviceFix = useRef<{ point: LatLng; accuracy?: number } | null>(null);
  const autoTried = useRef(Boolean(initialLocation) || homeLocation !== null);
  const homeRef = useRef(homeLocation);
  useEffect(() => {
    homeRef.current = homeLocation;
  }, [homeLocation]);
  /**
   * How a home neighborhood holds against the device: `auto` until the device turns out to be on a trip (then the map
   * follows it: `off`), `chosen` once the visitor went back home (the device no longer moves the map), `off` after a
   * press for "where I am now".
   */
  const homeHold = useRef<'auto' | 'chosen' | 'off'>(homeLocation ? 'auto' : 'off');
  const citiesRef = useRef(cities);
  useEffect(() => {
    citiesRef.current = cities;
  }, [cities]);

  const stopWatching = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined') navigator.geolocation?.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  /** The device's place on the map (a fix within a few steps of the last one changes nothing). */
  const showDevice = useCallback((point: LatLng, accuracy: number | undefined) => {
    setLocation((current) => {
      if (current.status === 'granted' && current.source !== 'home' && distanceMiles(current.point, point) < LOCATION_JITTER_MILES && current.accuracy === accuracy) return current;
      return { status: 'granted', point, accuracy, source: 'device' };
    });
  }, []);

  const watch = useCallback(
    (source: 'auto' | 'press') => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        if (source === 'press') setLocation({ status: 'unavailable' });
        return;
      }
      if (source === 'press') {
        // A press wants the device's place, over a home neighborhood too.
        homeHold.current = 'off';
        pressedAt.current = performance.now();
        setLocateIssue(null);
        const fix = watchId.current !== null ? deviceFix.current : null;
        if (fix) {
          showDevice(fix.point, fix.accuracy);
          setLocatePicks((count) => count + 1);
          return;
        }
        pressWaiting.current = true;
        setLocating(true);
        // Only a press says it's looking (an automatic try waits quietly, maybe behind the browser's question).
        if (locationRef.current.status !== 'granted') setLocation({ status: 'locating' });
      }
      if (watchId.current !== null) return;
      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const point = { lat: position.coords.latitude, lng: position.coords.longitude };
          const accuracy = Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : undefined;
          deviceFix.current = { point, accuracy };
          const home = homeRef.current;
          if (home?.status === 'granted' && homeHold.current !== 'off' && !pressWaiting.current) {
            // The home neighborhood leads: the device takes over only on a trip (another city, or far from home), and
            // never once the visitor chose home.
            if (homeHold.current === 'chosen' || !onTrip(home.point, point, citiesRef.current)) return;
            homeHold.current = 'off';
          }
          showDevice(point, accuracy);
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
            deviceFix.current = null;
            // Blocked (the site's settings say no, or the browser answered without asking), or only the question
            // closed: then it can be asked again, and the card invites the visitor to.
            const unasked = press && performance.now() - pressedAt.current < UNASKED_REFUSAL_MS;
            void locationPermission().then(({ state }) => {
              const dismissed = state === 'prompt' && !unasked;
              if (press) setLocateIssue(dismissed ? null : 'denied');
              setLocation(fallback ?? (dismissed ? { status: 'dismissed' } : press ? { status: 'denied' } : { status: 'idle' }));
            });
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
    [stopWatching, showDevice],
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

  const backToHome = useCallback(() => {
    const home = homeRef.current;
    if (!home) return;
    homeHold.current = 'chosen';
    pressWaiting.current = false;
    setLocating(false);
    setLocateIssue(null);
    setLocation(home);
    setLocatePicks((count) => count + 1);
  }, []);

  // Allowed before (on an earlier visit): found as the page opens, with no question (behind a helper's home
  // neighborhood, quietly: see `home`). The browser's answer can also change while the page is open (its settings).
  useEffect(() => {
    if (initialLocation) return;
    let cancelled = false;
    let status: PermissionStatus | undefined;
    const onChange = () => {
      if (!status) return;
      if (status.state === 'granted') watch('auto');
      else if (status.state === 'denied') {
        stopWatching();
        deviceFix.current = null;
        setLocation((current) => (current.status === 'granted' && current.source !== 'home' ? (homeRef.current ?? { status: 'idle' }) : current));
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
  }, [initialLocation, watch, stopWatching]);
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

  // The visitor's location falls in another open city (worked out here, on the device; only the city's slug is asked
  // for): the map goes there by itself, once per city in a visit. A city picked on an earlier visit stays, and so does
  // the page's city once a task of its brought the map back: the card offers the visitor's city instead. A city picked
  // in this visit stays with nothing offered (they know where they are).
  const autoMoved = useRef(new Set<string>());
  const [cityHere, setCityHere] = useState<MapCity | null>(null);
  const shownSlug = city.market.slug;
  useEffect(() => {
    const here = location.status === 'granted' && onLoadCity ? cityAt(cities, location.point) : null;
    const timer = window.setTimeout(() => {
      if (!here || here.slug === cityRef.current.market.slug || pickedNow.current) {
        setCityHere(null);
        return;
      }
      if (pickedEarlier.current || autoMoved.current.has(here.slug)) {
        setCityHere((current) => (current?.slug === here.slug ? current : here));
        return;
      }
      autoMoved.current.add(here.slug);
      setCityHere(null);
      switchCity(here.slug, 'location');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [location, cities, shownSlug, onLoadCity, switchCity]);

  // In no open city (one we haven't opened, or between cities): the card says so, by the place's name and with how
  // many wait there, and the map goes to the visitor's own area once in a visit, unless they picked a city (the card
  // then offers their area).
  const waitingPlaces = city.map.waiting ?? pageCity.map.waiting;
  const away = useMemo<AwayPlace | null>(() => {
    if (location.status !== 'granted') return null;
    const point = location.point;
    if (insideServiceArea(city.map, point) || cityAt(cities, point)) return null;
    return { point, source: location.source ?? 'device', place: waitingPlaceNear(waitingPlaces, point), nearest: nearestCity(cities, point) };
  }, [location, city.map, cities, waitingPlaces]);
  const isAway = away !== null;
  const awayCentered = useRef(false);
  useEffect(() => {
    if (!isAway || awayCentered.current) return;
    const timer = window.setTimeout(() => {
      if (awayCentered.current) return;
      awayCentered.current = true;
      if (pickedEarlier.current || pickedNow.current) return;
      setLocatePicks((count) => count + 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isAway]);

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
      backToHome,
      away,
      cityHere,
      autoLocate,
      pointer,
      audience,
      setAudience,
      area: area.value,
      areaPicks: area.picks,
      pickArea,
      city,
      cities,
      pageCitySlug: pageCity.market.slug,
      canSwitchCity: Boolean(onLoadCity),
      cityLoading,
      cityIssue,
      cityMovedFrom,
      switchCity,
    }),
    [
      selectedCategory,
      selectCategory,
      previewCategory,
      highlightedTaskId,
      focusedTaskId,
      focusTask,
      pickTask,
      location,
      requestLocation,
      locatePicks,
      locateDevice,
      locating,
      locateIssue,
      homeValue,
      backToHome,
      away,
      cityHere,
      autoLocate,
      audience,
      area,
      pickArea,
      city,
      cities,
      pageCity.market.slug,
      onLoadCity,
      cityLoading,
      cityIssue,
      cityMovedFrom,
      switchCity,
    ],
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
