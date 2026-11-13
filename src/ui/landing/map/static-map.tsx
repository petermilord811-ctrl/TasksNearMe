'use client';

import { useId, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { LandingMapData, TaskMapPin } from '@/contracts';
import type { LatLng } from '@/shared/geo';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from '../category-icons';
import { pixelsPerMile, projector } from './map-math';
import { PinCard, pinPrice } from './pin-card';

/** Soft at the top and bottom only: a full-width map flows into the sections around it. */
export const FADE_VERTICAL = {
  maskImage: 'linear-gradient(to bottom, transparent, #000 11%, #000 80%, transparent)',
  WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 11%, #000 80%, transparent)',
} as const;

/** The drawing's frames: mid-size (`card`), or full width (`wide`, a whole-city span). */
const FRAMES = { card: { width: 640, height: 480, span: 19 }, wide: { width: 1600, height: 1000, span: 46 } } as const;

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

/** A chip's width for its price (the drawing has no text measuring; DM Sans digits are about this wide). */
const chipWidth = (price: string) => 36 + price.length * 7.4;

/**
 * A drawn map of Austin: no tiles, no WebGL, no network. It's the placeholder until the live map loads,
 * the fallback without WebGL, and what previews and tests render (`mapMode: 'static'`). The same tasks as the
 * live map, as price chips in their category's color; the lit one shows its approximate area and its card.
 */
export function StaticMap({
  map,
  pins,
  activeCategory,
  highlightedTaskId,
  onHighlight,
  userPoint,
  milesById,
  withinMiles = null,
  fade = 'all',
  frame = 'card',
  padding,
  className,
}: {
  map: LandingMapData;
  pins: TaskMapPin[];
  activeCategory: string | null;
  highlightedTaskId: string | null;
  onHighlight: (id: string | null) => void;
  userPoint?: LatLng;
  milesById?: Map<string, number>;
  /** The visitor's chosen distance: a ring around them, and the tasks beyond it quiet. */
  withinMiles?: number | null;
  fade?: 'all' | 'vertical';
  frame?: keyof typeof FRAMES;
  /** Room panels take over the map (fractions): the city is centered in what's left. */
  padding?: { top: number; right: number; bottom: number; left: number };
  className?: string;
}) {
  const t = useTranslations('landing.map');
  const { width: W, height: H, span: SPAN_MILES } = FRAMES[frame];
  const ox = padding ? padding.left + (1 - padding.left - padding.right) / 2 : 0.5;
  const oy = padding ? padding.top + (1 - padding.top - padding.bottom) / 2 : 0.5;
  const uid = useId().replace(/:/g, '');
  const center = userPoint ?? map.center;
  const project = useMemo(() => projector(center, SPAN_MILES, W, H, { x: ox, y: oy }), [center, SPAN_MILES, W, H, ox, oy]);
  const perMile = pixelsPerMile(SPAN_MILES, W);
  const river = useMemo(() => path(RIVER.map(project)), [project]);
  const roads = useMemo(() => ROADS.map((road) => path(road.map(project))), [project]);
  const service = project(map.center);
  const you = userPoint ? project(userPoint) : null;
  const active = pins.find((pin) => pin.id === highlightedTaskId);
  const activeAt = active ? project(active.point) : null;
  const perHour = (rate: string) => t('perHour', { rate });
  // Chips where they fit (newest first), dots where they'd cover one another; the lit task always a chip, on top.
  const placed = useMemo(() => {
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const items = pins.map((pin) => {
      const at = project(pin.point);
      const price = pinPrice(pin, perHour);
      const width = chipWidth(price);
      const box = { x0: at.x - width / 2 - 4, y0: at.y - 20, x1: at.x + width / 2 + 4, y1: at.y + 20 };
      const fits = !boxes.some((other) => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0);
      if (fits) boxes.push(box);
      return { pin, at, price, width, chip: fits };
    });
    return items;
    // `perHour` is a fresh closure each render; the copy it reads doesn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, project]);
  const ordered = active ? [...placed.filter((item) => item.pin.id !== active.id), ...placed.filter((item) => item.pin.id === active.id)] : placed;

  return (
    <div className={cn('relative size-full', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={cn('absolute inset-0 size-full', fade === 'all' && 'map-fade')} style={fade === 'vertical' ? FADE_VERTICAL : undefined} aria-hidden="true" focusable="false">
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
        <circle cx={service.x} cy={service.y} r={map.serviceRadiusMiles * perMile} fill="none" stroke="var(--iri-3)" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />
        {roads.map((d, index) => (
          <g key={index}>
            <path d={d} fill="none" stroke="var(--map-road-casing)" strokeWidth="7" strokeLinecap="round" />
            <path d={d} fill="none" stroke="var(--map-road-major)" strokeWidth="4.5" strokeLinecap="round" />
          </g>
        ))}
        <path d={river} fill="none" stroke="var(--map-water)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />

        {you && withinMiles && <circle cx={you.x} cy={you.y} r={withinMiles * perMile} fill="var(--violet)" fillOpacity="0.06" stroke="var(--violet)" strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="5 5" />}

        {active && activeAt && (
          <circle
            cx={activeAt.x}
            cy={activeAt.y}
            r={(active.radiusMeters / 1609.34) * perMile}
            fill={`var(--cat-${active.categorySlug})`}
            fillOpacity="0.13"
            stroke={`var(--cat-${active.categorySlug})`}
            strokeOpacity="0.75"
            strokeWidth="1.8"
            strokeDasharray="6 5"
          />
        )}

        {ordered.map(({ pin, at, price, width, chip }) => {
          const outside = withinMiles !== null && (milesById?.get(pin.id) ?? 0) > withinMiles;
          const dim = (activeCategory !== null && pin.categorySlug !== activeCategory) || outside;
          const lit = pin.id === highlightedTaskId;
          const Icon = CATEGORY_ICONS[pin.categorySlug];
          const color = `var(--cat-${pin.categorySlug})`;
          return (
            <g
              key={pin.id}
              transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})${lit ? ' translate(0 -4) scale(1.08)' : ''}`}
              className="cursor-pointer transition-opacity duration-300"
              opacity={dim && !lit ? 0.28 : 1}
              onPointerEnter={() => onHighlight(pin.id)}
              onPointerLeave={() => onHighlight(null)}
            >
              {chip || lit ? (
                <>
                  <rect x={-width / 2} y={-16} width={width} height={32} rx={16} fill={lit ? `color-mix(in oklab, ${color} 68%, black)` : 'var(--card)'} stroke={color} strokeOpacity={lit ? 0 : 0.45} strokeWidth="1.5" style={{ filter: 'drop-shadow(0 6px 10px rgb(0 0 0 / 0.18))' }} />
                  <circle cx={-width / 2 + 16} cy={0} r={12} fill={lit ? 'rgb(255 255 255 / 0.25)' : color} fillOpacity={lit ? 1 : 0.16} />
                  <Icon x={-width / 2 + 9} y={-7} width={14} height={14} color={lit ? 'white' : color} strokeWidth={2.2} />
                  <text x={-width / 2 + 32} y={4.5} fontSize="13" fontWeight="600" fill={lit ? 'white' : 'var(--foreground)'} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {price}
                  </text>
                </>
              ) : (
                <circle r="7" fill={color} stroke="white" strokeWidth="2.5" style={{ filter: 'drop-shadow(0 3px 6px rgb(0 0 0 / 0.25))' }} />
              )}
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
