'use client';

import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { LandingMapData, TaskMapPin } from '@/contracts';
import type { LatLng } from '@/shared/geo';
import { cn } from '@/ui/lib/utils';
import type { MapControls } from './maplibre-view';
import { areaCells } from './neighborhoods';

const WIDTH = 176;
const HEIGHT = 128;
const MILES_PER_LAT = 69.05;
/** The view's corners are kept within this many service radii of the middle (a tilted camera sees to the horizon). */
const CORNER_REACH = 2.4;

/**
 * The minimap: the whole service area at a glance (its neighborhoods, the open tasks as dots, the visitor), with the
 * part the big map shows framed in violet, following it as it moves. A press or a drag on it moves the big map there.
 * A light drawing (no second map engine), only where there's a mouse: touch screens move the big map directly.
 * Decorative for assistive tech: the zoom, the neighborhood picker and the list reach the same places.
 */
export function MapMinimap({
  map,
  pins,
  controls,
  userPoint,
  selectedArea,
  className,
}: {
  map: LandingMapData;
  pins: TaskMapPin[];
  controls: MapControls;
  userPoint?: LatLng;
  selectedArea?: string | null;
  className?: string;
}) {
  const frameRef = useRef<SVGPolygonElement>(null);
  const dragging = useRef<number | null>(null);
  const radius = Math.max(1, map.serviceRadiusMiles);
  // Miles to pixels: the service circle (and a margin) fills the height.
  const scale = HEIGHT / (radius * 2 * 1.12);
  const milesPerLng = 69.17 * Math.cos((map.center.lat * Math.PI) / 180);
  const toXY = useMemo(
    () => (point: LatLng) => ({ x: WIDTH / 2 + (point.lng - map.center.lng) * milesPerLng * scale, y: HEIGHT / 2 - (point.lat - map.center.lat) * MILES_PER_LAT * scale }),
    [map.center.lat, map.center.lng, milesPerLng, scale],
  );
  const toLatLng = (x: number, y: number): LatLng => ({ lat: map.center.lat - (y - HEIGHT / 2) / (MILES_PER_LAT * scale), lng: map.center.lng + (x - WIDTH / 2) / (milesPerLng * scale) });
  const cells = useMemo(() => areaCells(map.areas, map.center, map.serviceRadiusMiles * 1.15), [map.areas, map.center, map.serviceRadiusMiles]);
  const outlines = useMemo(() => cells.map((cell) => ({ name: cell.name, points: cell.ring.map(([lng, lat]) => toXY({ lat, lng })).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') })), [cells, toXY]);

  // The big map's view, framed: moved by hand as the map moves (no re-render per frame).
  useEffect(() => {
    const draw = () => {
      const element = frameRef.current;
      if (!element) return;
      const reach = radius * CORNER_REACH;
      const corners = controls.corners();
      // Zoomed out past the whole service area: the frame would be bigger than the minimap, so none.
      const spanX = (Math.max(...corners.map(([lng]) => lng)) - Math.min(...corners.map(([lng]) => lng))) * milesPerLng * scale;
      const spanY = (Math.max(...corners.map(([, lat]) => lat)) - Math.min(...corners.map(([, lat]) => lat))) * MILES_PER_LAT * scale;
      if (spanX > WIDTH * 1.15 && spanY > HEIGHT * 1.15) {
        element.setAttribute('points', '');
        return;
      }
      const points = corners.map(([lng, lat]) => {
        let dx = (lng - map.center.lng) * milesPerLng;
        let dy = (lat - map.center.lat) * MILES_PER_LAT;
        const far = Math.hypot(dx, dy);
        if (!Number.isFinite(far)) return null;
        if (far > reach) {
          dx *= reach / far;
          dy *= reach / far;
        }
        return `${(WIDTH / 2 + dx * scale).toFixed(1)},${(HEIGHT / 2 - dy * scale).toFixed(1)}`;
      });
      element.setAttribute('points', points.every(Boolean) ? points.join(' ') : '');
    };
    draw();
    return controls.onMove(draw);
  }, [controls, map.center.lat, map.center.lng, milesPerLng, radius, scale]);

  const moveTo = (event: ReactPointerEvent<SVGSVGElement>, animate: boolean) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    const y = ((event.clientY - box.top) / box.height) * HEIGHT;
    controls.centerOn(toLatLng(x, y), animate);
  };

  const center = toXY(map.center);
  const you = userPoint ? toXY(userPoint) : null;
  return (
    <div aria-hidden="true" data-minimap="" className={cn('glass overflow-hidden rounded-2xl p-1 shadow-overlay', className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        className="block cursor-pointer touch-none rounded-xl bg-[var(--map-land)]"
        onPointerDown={(event) => {
          dragging.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveTo(event, true);
        }}
        onPointerMove={(event) => {
          if (dragging.current === event.pointerId) moveTo(event, false);
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
      >
        <circle cx={center.x} cy={center.y} r={radius * scale} fill="color-mix(in oklab, var(--map-park) 45%, transparent)" stroke="var(--iri-3)" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="2 3" />
        {outlines.map((outline) => (
          <polygon
            key={outline.name}
            points={outline.points}
            fill={outline.name === selectedArea ? 'color-mix(in oklab, var(--violet) 22%, transparent)' : 'transparent'}
            stroke="var(--foreground)"
            strokeOpacity="0.12"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />
        ))}
        {pins.map((pin) => {
          const at = toXY(pin.point);
          return <circle key={pin.id} cx={at.x} cy={at.y} r="2.1" fill={`var(--cat-${pin.categorySlug})`} stroke="var(--card)" strokeWidth="0.6" />;
        })}
        {you && <circle cx={you.x} cy={you.y} r="3.6" fill="var(--violet)" stroke="#fff" strokeWidth="1.4" />}
        <polygon ref={frameRef} fill="color-mix(in oklab, var(--violet) 12%, transparent)" stroke="var(--violet)" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
