'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MapArea, TaskBoardWhen, TaskMapPin, TimeZone } from '@/contracts';
import { whenRange as boardWhenRange } from '@/shared/board-match';
import type { LatLng } from '@/shared/geo';
import { usePrefersReducedMotion } from '@/ui/motion';
import { useLiveTasks, type MapPulse } from './live';
import { inTimeRange, type ListSort, type TimeRange, type ViewBounds } from './map-math';
import type { MapControls } from './maplibre-view';

/** Marks the map frame on the page (the list's "show on the map" buttons bring it into view on phones). */
export const MAP_FRAME_ATTRIBUTE = 'data-task-map';

/**
 * How long the map must rest after a move before the list follows it: a fling, a zoom with the wheel or a fly
 * reports several stops in a row, and the list should change once, after the last.
 */
export const VIEW_SETTLE_MS = 220;

/**
 * Something the explorer asks the live map to show: a neighborhood, one task (its card opens), a peek at a task
 * (keyboard focus in the list: the map moves only if the task is out of sight, and nothing opens), or the visitor
 * (their place and what's near it, or their chosen distance).
 */
export type MapFocusRequest =
  | { kind: 'area'; point: LatLng; nonce: number }
  | { kind: 'task'; id: string; nonce: number }
  | { kind: 'peek'; id: string; nonce: number }
  | { kind: 'you'; point: LatLng; nonce: number };

/** A request before it's numbered. */
export type MapFocusAsk = { kind: 'area'; point: LatLng } | { kind: 'task'; id: string } | { kind: 'peek'; id: string } | { kind: 'you'; point: LatLng };

/** What the map shows besides the pins. */
export interface MapLayers {
  /** The tasks as pins, or as a glow where help is needed. */
  mode: 'pins' | 'heat';
  buildings: boolean;
  serviceArea: boolean;
  /** Roads reached within 10 and 20 minutes' drive from the visitor (an estimate, worked out in the browser). */
  driveTimes: boolean;
  /** The map's light follows the market's clock (warm at sunset, roads lit at night). */
  clock: boolean;
}

export const DEFAULT_LAYERS: MapLayers = { mode: 'pins', buildings: false, serviceArea: true, driveTimes: false, clock: true };

interface ExplorerState {
  /** The visitor's pick, or null to follow the location (nearest once it's shared, newest before). */
  sortChoice: ListSort | null;
  setSortChoice: (sort: ListSort | null) => void;
  /** Only tasks within this many miles of the visitor (needs a shared location). */
  withinMiles: number | null;
  setWithinMiles: (miles: number | null) => void;
  /** The list shows what's on the map (once the live map has settled). */
  followMap: boolean;
  setFollowMap: (on: boolean) => void;
  /** What the live map shows, reported once it has settled after its arrival; null without a live map. */
  view: ViewBounds | null;
  setView: (bounds: ViewBounds | null) => void;
  /** The live map is up (its own controls only make sense then). */
  liveReady: boolean;
  setLiveReady: (ready: boolean) => void;
  /** The live map's camera, while it's up (the heading's card sends it back to the city from the visitor's own area). */
  mapControls: MapControls | null;
  setMapControls: (controls: MapControls | null) => void;
  /**
   * The visitor has started using the map (a drag, a zoom, a turn, a group opened, a task shown): the heading's card
   * folds to one line on wide screens so the map has the room, until the visitor opens it again.
   */
  engaged: boolean;
  setEngaged: (engaged: boolean) => void;
  /** Wide screens: the explorer folded to its search and count (the map takes its side). */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  /** The city's live stream is open (the map's "Live" dot says so); false before it opens and while it reconnects. */
  connected: boolean;
  /** The market's time zone (the map's hour). */
  timeZone?: TimeZone;
  /** The visitor has come to the map (it's loading, or up): the tasks are kept live from then on. */
  setNear: (near: boolean) => void;
  request: MapFocusRequest | null;
  requestFocus: (request: MapFocusAsk) => void;
  layers: MapLayers;
  setLayers: (layers: MapLayers) => void;
  /** The open tasks now: the page's, kept live by the market's stream (new ones in, booked ones out). */
  pins: TaskMapPin[];
  /** Tasks that just arrived (they drop in on the map). */
  arrivals: ReadonlySet<string>;
  /** Soft pulses where something just happened (a new task, an offer, a booking). */
  pulses: MapPulse[];
  /** The newest arrival, for the note on the map. */
  latest: TaskMapPin | null;
  dismissLatest: () => void;
  /** Today, this weekend, this week (the task board's own "when"), or any time. */
  when: TaskBoardWhen;
  setWhen: (when: TaskBoardWhen) => void;
  /** The time `when` covers now (null: any time). */
  whenRange: TimeRange | null;
  /** The tasks the map shows: the live ones in the chosen time (the others fade away). */
  mapPins: TaskMapPin[];
  /** Drawing an outline on the map to watch an area. */
  drawing: boolean;
  setDrawing: (on: boolean) => void;
  /** The neighborhoods a drawn outline took in, waiting for "Get alerts" (null: none). */
  watchAreas: MapArea[] | null;
  setWatchAreas: (areas: MapArea[] | null) => void;
}

const ExplorerContext = createContext<ExplorerState | null>(null);
const EMPTY_PINS: TaskMapPin[] = [];

/**
 * The map explorer's own state: how the list is ordered and narrowed (distance, what's on the map), what the
 * live map reports, the layers, and requests to show a neighborhood or a task. Kept apart from the landing
 * page's shared state, so moving the map never re-renders the hero.
 */
export function MapExplorerProvider({
  children,
  pins: initialPins = EMPTY_PINS,
  marketSlug,
  timeZone,
  initialView,
}: {
  children: ReactNode;
  /** The open tasks the page loaded with. */
  pins?: TaskMapPin[];
  /** The market whose live stream keeps them current (none: they stay as loaded). */
  marketSlug?: string;
  /** The market's zone: "today" and "this weekend" are on its calendar. */
  timeZone?: TimeZone;
  /** Previews: the map already in use (the card folded) and the explorer folded. */
  initialView?: { engaged?: boolean; collapsed?: boolean };
}) {
  const [sortChoice, setSortChoice] = useState<ListSort | null>(null);
  const [withinMiles, setWithinMiles] = useState<number | null>(null);
  const [followMap, setFollowMap] = useState(true);
  const [view, setViewState] = useState<ViewBounds | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [mapControls, setMapControls] = useState<MapControls | null>(null);
  const [engaged, setEngaged] = useState(initialView?.engaged ?? false);
  const [collapsed, setCollapsed] = useState(initialView?.collapsed ?? false);
  const [near, setNear] = useState(false);
  const [request, setRequest] = useState<MapFocusRequest | null>(null);
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS);
  const [when, setWhen] = useState<TaskBoardWhen>('any');
  const [drawing, setDrawing] = useState(false);
  const [watchAreas, setWatchAreas] = useState<MapArea[] | null>(null);
  // Another city: an outline drawn on the last one, and what the map showed there, don't carry over.
  const [shownMarket, setShownMarket] = useState(marketSlug);
  if (shownMarket !== marketSlug) {
    setShownMarket(marketSlug);
    setDrawing(false);
    setWatchAreas(null);
    setViewState(null);
  }
  const reduced = usePrefersReducedMotion();
  // The stream opens once the visitor comes to the map (a visit that never scrolls down opens nothing); the list
  // follows it even where the live map can't run (no WebGL: the drawn map stays).
  const live = useLiveTasks(initialPins, marketSlug, { enabled: near || liveReady, reduced });
  // "Today" and "this week" run from now: the range is worked out again every few minutes while one is chosen.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (when === 'any') return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [when]);
  const whenRange = useMemo<TimeRange | null>(() => {
    void tick;
    const range = timeZone ? boardWhenRange(when, new Date(), timeZone) : null;
    return range ? { from: range.from.getTime(), to: range.to.getTime() } : null;
  }, [when, timeZone, tick]);
  const mapPins = useMemo(() => (whenRange ? live.pins.filter((pin) => inTimeRange(pin, whenRange)) : live.pins), [live.pins, whenRange]);
  const nonce = useRef(0);
  const settling = useRef<number | undefined>(undefined);

  // The map reports where it stopped; the list follows once it has rested (`VIEW_SETTLE_MS`), and only when it
  // really moved (sub-pixel jitter is ignored).
  const setView = useCallback((bounds: ViewBounds | null) => {
    window.clearTimeout(settling.current);
    if (!bounds) {
      setViewState(null);
      return;
    }
    settling.current = window.setTimeout(() => {
      setViewState((current) => {
        if (!current) return bounds;
        const same = Math.abs(current.west - bounds.west) < 1e-5 && Math.abs(current.east - bounds.east) < 1e-5 && Math.abs(current.south - bounds.south) < 1e-5 && Math.abs(current.north - bounds.north) < 1e-5;
        return same ? current : bounds;
      });
    }, VIEW_SETTLE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(settling.current), []);
  const requestFocus = useCallback((next: MapFocusAsk) => {
    nonce.current += 1;
    setRequest({ ...next, nonce: nonce.current } as MapFocusRequest);
  }, []);

  const value = useMemo<ExplorerState>(
    () => ({
      sortChoice,
      setSortChoice,
      withinMiles,
      setWithinMiles,
      followMap,
      setFollowMap,
      view,
      setView,
      liveReady,
      setLiveReady,
      mapControls,
      setMapControls,
      engaged,
      setEngaged,
      collapsed,
      setCollapsed,
      connected: live.connected,
      timeZone,
      setNear,
      request,
      requestFocus,
      layers,
      setLayers,
      pins: live.pins,
      arrivals: live.arrivals,
      pulses: live.pulses,
      latest: live.latest,
      dismissLatest: live.dismissLatest,
      when,
      setWhen,
      whenRange,
      mapPins,
      drawing,
      setDrawing,
      watchAreas,
      setWatchAreas,
    }),
    [sortChoice, withinMiles, followMap, view, setView, liveReady, mapControls, engaged, collapsed, live.connected, timeZone, request, requestFocus, layers, live.pins, live.arrivals, live.pulses, live.latest, live.dismissLatest, when, whenRange, mapPins, drawing, watchAreas],
  );
  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

export function useMapExplorer(): ExplorerState {
  const state = useContext(ExplorerContext);
  if (!state) throw new Error('useMapExplorer must be used inside <MapExplorerProvider>.');
  return state;
}

/** For pieces that also render outside the explorer (they then behave as if nothing is shared). */
export function useOptionalMapExplorer(): ExplorerState | null {
  return useContext(ExplorerContext);
}
