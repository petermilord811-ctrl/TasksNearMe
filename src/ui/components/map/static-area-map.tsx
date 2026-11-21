'use client';

import type { LatLng } from '@/shared/geo';
import { METERS_PER_MILE, projector } from '@/ui/landing/map/map-math';
import { cn } from '@/ui/lib/utils';
import type { AreaMapPlace } from './area-map';

const SIZE = 600;

/**
 * The drawn map: the same places, rings and markers on a plain paper background, without tiles. Shown
 * while the live map loads, where WebGL or the tiles aren't available, and in previews.
 */
export function StaticAreaMap({ places, serviceArea, fallbackCenter, activeId, onActiveChange, onSelect, groupLabel, className }: {
  places: AreaMapPlace[];
  serviceArea?: { center: LatLng; radiusMiles: number };
  fallbackCenter: LatLng;
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  onSelect?: (id: string) => void;
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
      {ring && <circle cx={ring.x} cy={ring.y} r={ring.r} className="fill-primary/5 stroke-primary/50" strokeWidth={1.5} strokeDasharray="5 5" />}
      {places.map((place) => {
        const at = project(place.point);
        const r = Math.max(10, (place.radiusMeters / METERS_PER_MILE) * pxPerMile);
        const active = activeId === place.id;
        return <circle key={place.id} cx={at.x} cy={at.y} r={r} className={active ? 'fill-primary/30 stroke-primary' : 'fill-primary/12 stroke-primary/60'} strokeWidth={active ? 2.5 : 1} />;
      })}
    </svg>
    {[...spots.values()].filter((spot) => inView(spot.x, spot.y)).map((spot) => {
      const single = spot.ids.length === 1 ? byId.get(spot.ids[0]!) : undefined;
      const active = spot.ids.includes(activeId ?? '');
      const style = { left: `${(spot.x / SIZE) * 100}%`, top: `${(spot.y / SIZE) * 100}%` };
      return <button
        key={spot.ids.join(',')}
        type="button"
        style={style}
        aria-label={single ? single.name : groupLabel(spot.ids.length)}
        // The live map hands keyboard focus over by this when it replaces the drawn one (accessibility pass).
        data-place-id={spot.ids[0]}
        onMouseEnter={() => onActiveChange?.(spot.ids[0] ?? null)}
        onMouseLeave={() => onActiveChange?.(null)}
        onFocus={() => onActiveChange?.(spot.ids[0] ?? null)}
        onBlur={() => onActiveChange?.(null)}
        onClick={() => onSelect?.(spot.ids[0]!)}
        className={cn(
          'absolute flex min-h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border px-2.5 text-xs font-semibold tabular-nums shadow-sm transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          active ? 'z-10 scale-110 border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:scale-105',
        )}
      >{single ? single.label : spot.ids.length}</button>;
    })}
  </div>;
}
