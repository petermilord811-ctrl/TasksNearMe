'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { LatLng } from '@/shared/geo';
import { cn } from '@/ui/lib/utils';
import { useMapTiles } from './map-tiles';
import { StaticAreaMap } from './static-area-map';

/**
 * A map of general areas: each place is its public point and area circle, never an address. The live map
 * (MapLibre with free OpenFreeMap tiles, recolored to the page; `live-area-map.tsx`, loaded only when shown)
 * fades in over a drawn map, which stays when WebGL or the tiles aren't available, and in previews and tests.
 * Markers in the same spot group into a count; hovering or focusing one lights it and reports it, so a list
 * beside the map can light its row too. The wheel scrolls the page until the map is clicked; touch needs two
 * fingers.
 */

export interface AreaMapPlace {
  id: string;
  point: LatLng;
  radiusMeters: number;
  /** The marker's text, e.g. "$60" or "$30/h". */
  label: string;
  /** The marker's accessible name, e.g. "Assemble a desk, $60, Mueller". */
  name: string;
}

export interface AreaMapProps {
  /** The tiles; the app's (`MapTilesProvider`) when absent. */
  styleUrl?: string;
  attribution?: string;
  places: AreaMapPlace[];
  /** A dashed ring: the helper's area and how far they travel. */
  serviceArea?: { center: LatLng; radiusMiles: number };
  /** Where to look when there's nothing else to frame. */
  fallbackCenter: LatLng;
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  label: string;
  /** The id of text that explains the map (a legend beside it): the map region's description. */
  describedBy?: string;
  groupLabel: (count: number) => string;
  /** The live map, or only the drawn one; the app's setting (`MapTilesProvider`) when absent. */
  live?: boolean;
  className?: string;
}

const LiveAreaMap = dynamic(() => import('./live-area-map').then((module) => module.LiveAreaMap), { ssr: false });

export function AreaMap(props: AreaMapProps) {
  const tiles = useMapTiles();
  const wantLive = props.live ?? tiles.live;
  const [live, setLive] = useState<'loading' | 'ready' | 'failed'>(wantLive ? 'loading' : 'failed');
  // The live map (MapLibre's code, its style and tiles, a WebGL context) loads once the map is about to be seen: one
  // hidden on phones (find work's list) or further down the page costs nothing until then, the drawn map standing in
  // (speed on a phone, 2026-11-21). Without IntersectionObserver (tests), it loads at once, as before.
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof window !== 'undefined' && typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = box.current;
    if (!wantLive || near || !element || typeof IntersectionObserver === 'undefined') return;
    // Seen soon, and the page done with its first work (paint, hydration, the first taps): then MapLibre comes in.
    let idle = 0;
    const whenIdle = (run: () => void) => typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 2500 }) : window.setTimeout(run, 1200);
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      idle = whenIdle(() => setNear(true));
    }, { rootMargin: '300px 0px' });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [wantLive, near]);
  const drawn = <StaticAreaMap places={props.places} serviceArea={props.serviceArea} fallbackCenter={props.fallbackCenter} activeId={props.activeId} onActiveChange={props.onActiveChange} onSelect={props.onSelect} groupLabel={props.groupLabel} className="absolute inset-0" />;
  // One landmark per map, named by its label, whichever map shows (the drawn one or the live one): its markers and the
  // live map's canvas (a named group) sit inside it, and nothing around it adds another (accessibility pass, J-A10).
  return <div ref={box} role="region" aria-label={props.label} aria-describedby={props.describedBy} className={cn('relative min-h-40 overflow-hidden rounded-xl border bg-card', props.className)}>
    {live !== 'ready' && drawn}
    {near && live !== 'failed' && <LiveAreaMap {...props} styleUrl={props.styleUrl ?? tiles.styleUrl} visible={live === 'ready'} onReady={() => setLive('ready')} onFailed={() => setLive('failed')} />}
    <p className="pointer-events-none absolute right-2 bottom-1 z-10 rounded bg-card/80 px-1.5 text-[10px] text-muted-foreground">{props.attribution ?? tiles.attribution}</p>
  </div>;
}
