'use client';

import { useId, useMemo } from 'react';
import type { LandingMapData, TaskMapPin } from '@/contracts';
import type { LatLng } from '@/shared/geo';
import { cn } from '@/ui/lib/utils';
import { pixelsPerMile, projector } from './map-math';
import { PinCard } from './pin-card';

const W = 640;
const H = 480;
const SPAN_MILES = 19;

/** Real reference lines around central Austin (approximate), drawn softly so the city reads at a glance. */
const RIVER: LatLng[] = [
  { lat: 30.344, lng: -97.892 },
  { lat: 30.318, lng: -97.842 },
  { lat: 30.296, lng: -97.81 },
  { lat: 30.278, lng: -97.785 },
  { lat: 30.266, lng: -97.762 },
  { lat: 30.262, lng: -97.741 },
  { lat: 30.256, lng: -97.716 },
  { lat: 30.248, lng: -97.69 },
  { lat: 30.236, lng: -97.655 },
  { lat: 30.222, lng: -97.62 },
];
const ROADS: LatLng[][] = [
  // I-35
  [{ lat: 30.43, lng: -97.676 }, { lat: 30.36, lng: -97.706 }, { lat: 30.3, lng: -97.718 }, { lat: 30.262, lng: -97.737 }, { lat: 30.21, lng: -97.752 }, { lat: 30.14, lng: -97.79 }],
  // MoPac
  [{ lat: 30.43, lng: -97.722 }, { lat: 30.36, lng: -97.754 }, { lat: 30.3, lng: -97.772 }, { lat: 30.25, lng: -97.79 }, { lat: 30.2, lng: -97.83 }, { lat: 30.15, lng: -97.86 }],
  // US 183
  [{ lat: 30.43, lng: -97.79 }, { lat: 30.37, lng: -97.72 }, { lat: 30.33, lng: -97.69 }, { lat: 30.27, lng: -97.66 }, { lat: 30.2, lng: -97.66 }],
  // Ben White / SH 71
  [{ lat: 30.23, lng: -97.86 }, { lat: 30.224, lng: -97.79 }, { lat: 30.218, lng: -97.74 }, { lat: 30.205, lng: -97.68 }],
];

function path(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const mid = { x: (points[i]!.x + points[i + 1]!.x) / 2, y: (points[i]!.y + points[i + 1]!.y) / 2 };
    d += ` Q${points[i]!.x.toFixed(1)} ${points[i]!.y.toFixed(1)} ${mid.x.toFixed(1)} ${mid.y.toFixed(1)}`;
  }
  const last = points[points.length - 1]!;
  return `${d} T${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
}

/**
 * A drawn map of Austin: no tiles, no WebGL, no network. It's the placeholder until the live map loads,
 * the fallback without WebGL, and what previews and tests render (`mapMode: 'static'`). Same pins, same
 * colors, same interactions as the live map.
 */
export function StaticMap({
  map,
  pins,
  activeCategory,
  highlightedTaskId,
  onHighlight,
  userPoint,
  milesById,
  className,
}: {
  map: LandingMapData;
  pins: TaskMapPin[];
  activeCategory: string | null;
  highlightedTaskId: string | null;
  onHighlight: (id: string | null) => void;
  userPoint?: LatLng;
  milesById?: Map<string, number>;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const center = userPoint ?? map.center;
  const project = useMemo(() => projector(center, SPAN_MILES, W, H), [center]);
  const perMile = pixelsPerMile(SPAN_MILES, W);
  const river = useMemo(() => path(RIVER.map(project)), [project]);
  const roads = useMemo(() => ROADS.map((road) => path(road.map(project))), [project]);
  const service = project(map.center);
  const you = userPoint ? project(userPoint) : null;
  const active = pins.find((pin) => pin.id === highlightedTaskId);
  const activeAt = active ? project(active.point) : null;

  return (
    <div className={cn('relative size-full', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="map-fade absolute inset-0 size-full" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={`streets-${uid}`} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
            <path d="M0 11H22M11 0V22" stroke="var(--map-road)" strokeWidth="1.2" />
          </pattern>
          <radialGradient id={`glow-${uid}`}>
            <stop offset="0" stopColor="white" stopOpacity="0.9" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="var(--map-land)" />
        <rect width={W} height={H} fill={`url(#streets-${uid})`} opacity="0.75" />
        <circle cx={service.x} cy={service.y} r={map.serviceRadiusMiles * perMile} fill="none" stroke="var(--iri-3)" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />
        {roads.map((d, index) => (
          <path key={index} d={d} fill="none" stroke="var(--map-road-major)" strokeWidth="5" strokeLinecap="round" />
        ))}
        <path d={river} fill="none" stroke="var(--map-water)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />

        {pins.map((pin) => {
          const at = project(pin.point);
          const dim = activeCategory !== null && pin.categorySlug !== activeCategory;
          const lit = pin.id === highlightedTaskId;
          return (
            <g
              key={pin.id}
              transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`}
              className="cursor-pointer transition-opacity duration-300"
              opacity={dim ? 0.22 : 1}
              onPointerEnter={() => onHighlight(pin.id)}
              onPointerLeave={() => onHighlight(null)}
            >
              <circle r={(pin.radiusMeters / 1609.34) * perMile} fill={`var(--cat-${pin.categorySlug})`} opacity={lit ? 0.22 : 0.1} className="transition-opacity duration-300" />
              {lit && <circle r="10" fill={`var(--cat-${pin.categorySlug})`} opacity="0.35" className="origin-center [animation:pulse-ring_1.4s_var(--ease-out)_infinite]" style={{ transformBox: 'fill-box' }} />}
              <circle r={lit ? 8.5 : 6} fill={`var(--cat-${pin.categorySlug})`} stroke="white" strokeWidth="2.2" className="transition-all duration-300" />
            </g>
          );
        })}

        {you && (
          <g transform={`translate(${you.x.toFixed(1)} ${you.y.toFixed(1)})`}>
            <circle r="34" fill={`url(#glow-${uid})`} />
            <circle r="16" fill="var(--violet)" opacity="0.18" className="origin-center [animation:pulse-ring_2s_var(--ease-out)_infinite]" style={{ transformBox: 'fill-box' }} />
            <circle r="7" fill="var(--violet)" stroke="white" strokeWidth="3" />
          </g>
        )}
      </svg>
      {active && activeAt && (
        <PinCard pin={active} x={`${(activeAt.x / W) * 100}%`} y={`${(activeAt.y / H) * 100}%`} placement={activeAt.y / H < 0.42 ? 'below' : 'above'} miles={milesById?.get(active.id)} />
      )}
    </div>
  );
}
