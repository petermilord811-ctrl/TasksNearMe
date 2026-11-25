'use client';

import type { LatLng } from '@/shared/geo';
import { METERS_PER_MILE, projector } from '@/ui/landing/map/map-math';
import { cn } from '@/ui/lib/utils';
import type { AreaMapPlace } from './area-map';
import { MapCluster, MapPin } from './map-pins';

const SIZE = 600;

/**
 * The drawn map: the same places, rings and markers on a plain paper background, without tiles. Shown
 * while the live map loads, where WebGL or the tiles aren't available, and in previews.
 */
export function StaticAreaMap({ places, serviceArea, fallbackCenter, activeId, selectedId, onActiveChange, onSelect, groupLabel, className }: {
  places: AreaMapPlace[];
  serviceArea?: { center: LatLng; radiusMiles: number };
  fallbackCenter: LatLng;
  activeId?: string | null;
  selectedId?: string | null;
  onActiveChange?: (id: string | null) => void;
  onSelect?: (id: string | null) => void;
  groupLabel: (count: number) => string;
  className?: string;
}) {
  const center = serviceArea?.center ?? fallbackCenter;
  const spanMiles = Math.max(6, (serviceArea?.radiusMiles ?? 5) * 2.6);
  const project = projector(center, spanMiles, SIZE, SIZE);
  const pxPerMile = SIZE / spanMiles;
  const ring = serviceArea ? { ...project(serviceArea.center), r: serviceArea.radiusMiles * pxPerMile } : null;
  // Places in the same spot (a busy neighborhood) share one marker.
  const spots = new Map<string, { x: number; y: number; ids: string[] }>();
  for (const place of places) {
    const at = project(place.point);
    const key = `${Math.round(at.x / 28)}:${Math.round(at.y / 28)}`;
    const spot = spots.get(key) ?? { x: at.x, y: at.y, ids: [] };
    spot.ids.push(place.id);
    spots.set(key, spot);
  }
  const byId = new Map(places.map((place) => [place.id, place]));
  const inView = (x: number, y: number) => x > 8 && x < SIZE - 8 && y > 8 && y < SIZE - 8;

  return <div className={cn('relative overflow-hidden rounded-xl border bg-[var(--map-land,#f6efe6)]', className)}>
    {/* The picture of the areas; AreaMap's region names the map and the markers name the places (J-A10). */}
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 size-full">
      <defs>
        <pattern id="area-map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="currentColor" strokeOpacity="0.06" /></pattern>
      </defs>
      <rect width={SIZE} height={SIZE} fill="url(#area-map-grid)" className="text-foreground" />
      {ring && <circle cx={ring.x} cy={ring.y} r={ring.r} fill="var(--violet, #6d4ef5)" fillOpacity={0.04} stroke="var(--violet, #6d4ef5)" strokeOpacity={0.55} strokeWidth={1.6} strokeDasharray="2 5" strokeLinecap="round" />}
      {places.map((place) => {
        const at = project(place.point);
        const r = Math.max(10, (place.radiusMeters / METERS_PER_MILE) * pxPerMile);
        const active = activeId === place.id || selectedId === place.id;
        // Each area in its task's category color, as the live map draws it.
        const color = place.categorySlug ? `var(--cat-${place.categorySlug})` : 'var(--primary)';
        return <circle key={place.id} cx={at.x} cy={at.y} r={r} fill={color} fillOpacity={active ? 0.24 : 0.1} stroke={color} strokeOpacity={active ? 0.9 : 0.55} strokeWidth={active ? 2.5 : 1.2} />;
      })}
    </svg>
    {[...spots.values()].filter((spot) => inView(spot.x, spot.y)).map((spot) => {
      const single = spot.ids.length === 1 ? byId.get(spot.ids[0]!) : undefined;
      const lit = spot.ids.includes(activeId ?? '') || spot.ids.includes(selectedId ?? '');
      const style = { left: `${(spot.x / SIZE) * 100}%`, top: `${(spot.y / SIZE) * 100}%` };
      const enter = () => onActiveChange?.(spot.ids[0] ?? null);
      const leave = () => onActiveChange?.(null);
      // The same pins as the live map's (`map-pins.tsx`), so nothing changes look when it takes over.
      return <div key={spot.ids.join(',')} style={style} className={cn('absolute -translate-x-1/2 -translate-y-1/2', lit && 'z-10')}>
        {single
          ? <MapPin placeId={single.id} name={single.name} label={single.label} categorySlug={single.categorySlug} chip lit={activeId === single.id} picked={selectedId === single.id} fresh={single.fresh} onEnter={enter} onLeave={leave} onPick={() => onSelect?.(single.id)} />
          : <MapCluster placeIds={spot.ids} categories={spot.ids.map((id) => byId.get(id)?.categorySlug)} name={groupLabel(spot.ids.length)} lit={lit} onEnter={enter} onLeave={leave} onExpand={() => onSelect?.(spot.ids[0]!)} />}
      </div>;
    })}
  </div>;
}
