'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LatLng } from '@/shared/geo';
import type { ListSort, ViewBounds } from './map-math';

/** Marks the map frame on the page (the list's "show on the map" buttons bring it into view on phones). */
export const MAP_FRAME_ATTRIBUTE = 'data-task-map';

/** Something the explorer asks the live map to show: a neighborhood, or one task (its card opens). */
export type MapFocusRequest = { kind: 'area'; point: LatLng; nonce: number } | { kind: 'task'; id: string; nonce: number };

/** What the map shows besides the pins. */
export interface MapLayers {
  /** The tasks as pins, or as a glow where help is needed. */
  mode: 'pins' | 'heat';
  buildings: boolean;
  serviceArea: boolean;
}

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
  request: MapFocusRequest | null;
  requestFocus: (request: { kind: 'area'; point: LatLng } | { kind: 'task'; id: string }) => void;
  layers: MapLayers;
  setLayers: (layers: MapLayers) => void;
}

const ExplorerContext = createContext<ExplorerState | null>(null);

/**
 * The map explorer's own state: how the list is ordered and narrowed (distance, what's on the map), what the
 * live map reports, the layers, and requests to show a neighborhood or a task. Kept apart from the landing
 * page's shared state, so moving the map never re-renders the hero.
 */
export function MapExplorerProvider({ children }: { children: ReactNode }) {
  const [sortChoice, setSortChoice] = useState<ListSort | null>(null);
  const [withinMiles, setWithinMiles] = useState<number | null>(null);
  const [followMap, setFollowMap] = useState(true);
  const [view, setViewState] = useState<ViewBounds | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [request, setRequest] = useState<MapFocusRequest | null>(null);
  const [layers, setLayers] = useState<MapLayers>({ mode: 'pins', buildings: false, serviceArea: true });
  const nonce = useRef(0);

  const setView = useCallback((bounds: ViewBounds | null) => {
    setViewState((current) => {
      if (!bounds || !current) return bounds;
      // Ignore sub-pixel jitter: only a real move changes what the list shows.
      const same = Math.abs(current.west - bounds.west) < 1e-5 && Math.abs(current.east - bounds.east) < 1e-5 && Math.abs(current.south - bounds.south) < 1e-5 && Math.abs(current.north - bounds.north) < 1e-5;
      return same ? current : bounds;
    });
  }, []);
  const requestFocus = useCallback((next: { kind: 'area'; point: LatLng } | { kind: 'task'; id: string }) => {
    nonce.current += 1;
    setRequest({ ...next, nonce: nonce.current } as MapFocusRequest);
  }, []);

  const value = useMemo<ExplorerState>(
    () => ({ sortChoice, setSortChoice, withinMiles, setWithinMiles, followMap, setFollowMap, view, setView, liveReady, setLiveReady, request, requestFocus, layers, setLayers }),
    [sortChoice, withinMiles, followMap, view, setView, liveReady, request, requestFocus, layers],
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
