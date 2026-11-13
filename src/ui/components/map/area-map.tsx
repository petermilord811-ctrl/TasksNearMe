'use client';

import { useState } from 'react';
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
  const drawn = <StaticAreaMap places={props.places} serviceArea={props.serviceArea} fallbackCenter={props.fallbackCenter} activeId={props.activeId} onActiveChange={props.onActiveChange} onSelect={props.onSelect} label={props.label} groupLabel={props.groupLabel} className="absolute inset-0" />;
  return <div className={cn('relative min-h-40 overflow-hidden rounded-xl border bg-card', props.className)}>
    {live !== 'ready' && drawn}
    {live !== 'failed' && <LiveAreaMap {...props} styleUrl={props.styleUrl ?? tiles.styleUrl} visible={live === 'ready'} onReady={() => setLive('ready')} onFailed={() => setLive('failed')} />}
    <p className="pointer-events-none absolute right-2 bottom-1 z-10 rounded bg-card/80 px-1.5 text-[10px] text-muted-foreground">{props.attribution ?? tiles.attribution}</p>
  </div>;
}
