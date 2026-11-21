'use client';

import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { routes, type LandingMapData, type MapCity, type TaskMapPin, type TimeZone } from '@/contracts';
import { distanceMiles, type LatLng } from '@/shared/geo';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { lightAt, type ClockPhase } from './clock';
import type { MapControls } from './maplibre-view';
import { aboutMiles, driveMinutes } from './map-math';
import { areaCells } from './neighborhoods';
import { placeCityLabels, projectUS, US_PATH, US_VIEW } from './us-outline';

const WIDTH = 208;
const HEIGHT = 132;
const COUNTRY_HEIGHT = Math.round((WIDTH * US_VIEW.height) / US_VIEW.width);
const MILES_PER_LAT = 69.05;
/** The view's corners are kept within this many service radii of the middle (a tilted camera sees to the horizon). */
const CORNER_REACH = 2.4;
/** Farther than this past the service area, the visitor is "elsewhere": the minimap opens on the country. */
const ELSEWHERE_MILES = 25;
const CLOCK_ICONS: Record<ClockPhase, typeof Sun> = { day: Sun, golden: Sunset, dusk: Sunset, dawn: Sunrise, night: Moon };

type Scope = 'city' | 'country';

/**
 * The minimap, two ways (owner, 2026-11-21: the site isn't only for its first city):
 * - **The city**: its service area at a glance (neighborhoods, open tasks as dots, the visitor), with the part the big
 *   map shows framed in violet, following it as it moves. A press or a drag on it moves the big map there.
 * - **The country**: every city open or opening, the visitor, and how far the nearest open city is (with an estimate of
 *   the drive). Each city is a link to its page, an opening one to the waitlist; this city's own switches to its view.
 * It opens on the country when the visitor is far from this city, on the city otherwise; its header names the city and
 * its hour (the map's light follows it). A light drawing (no second map engine), only where there's a mouse: touch
 * screens move the big map directly. The drawings are decorative; the switch and the cities' links are real controls.
 */
export function MapMinimap({
  map,
  pins,
  controls,
  userPoint,
  selectedArea,
  market,
  marketSlug,
  timeZone,
  className,
}: {
  map: LandingMapData;
  pins: TaskMapPin[];
  controls: MapControls;
  userPoint?: LatLng;
  selectedArea?: string | null;
  /** The city's name, for the header. */
  market?: string;
  marketSlug?: string;
  timeZone?: TimeZone;
  className?: string;
}) {
  const t = useTranslations('landing.map');
  const elsewhere = userPoint ? distanceMiles(map.center, userPoint) > map.serviceRadiusMiles + ELSEWHERE_MILES : false;
  const [chosen, setChosen] = useState<Scope | null>(null);
  const scope: Scope = chosen ?? (elsewhere ? 'country' : 'city');
  return (
    <div data-minimap="" data-map-panel="" className={cn('glass overflow-hidden rounded-2xl p-1.5 shadow-overlay', className)}>
      <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
        <MinimapClock market={market} center={map.center} timeZone={timeZone} />
        <div role="group" aria-label={t('minimapScope')} className="flex shrink-0 rounded-full bg-foreground/[0.07] p-0.5 text-[11px] font-semibold">
          {(['city', 'country'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setChosen(value)}
              className={cn('min-h-6 rounded-full px-2 transition-colors', scope === value ? 'bg-card text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.15)]' : 'text-muted-foreground hover:text-foreground')}
            >
              {value === 'city' ? t('minimapCity') : t('minimapCountry')}
            </button>
          ))}
        </div>
      </div>
      {scope === 'city' ? (
        <CityView map={map} pins={pins} controls={controls} userPoint={userPoint} selectedArea={selectedArea} />
      ) : (
        <CountryView cities={map.cities} currentSlug={marketSlug} userPoint={userPoint} onCurrent={() => setChosen('city')} />
      )}
    </div>
  );
}

/** The city's name and its hour, with the light's icon (day, low sun, night); the whole phrase for a pointer's rest. */
function MinimapClock({ market, center, timeZone }: { market?: string; center: LatLng; timeZone?: TimeZone }) {
  const t = useTranslations('landing.map');
  const { formatTime } = useFormat(timeZone);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  if (!market) return <span />;
  const phase = now ? lightAt(now, center).phase : null;
  const Icon = phase ? CLOCK_ICONS[phase] : null;
  return (
    <p className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold" title={now && phase ? t(`clock.${phase}`, { market, time: formatTime(now) }) : undefined}>
      {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0 text-violet" />}
      <span className="truncate">{now ? t('minimapClock', { market, time: formatTime(now) }) : market}</span>
    </p>
  );
}

/** The city's service area, with the big map's view framed; a press or a drag moves the big map there. */
function CityView({ map, pins, controls, userPoint, selectedArea }: { map: LandingMapData; pins: TaskMapPin[]; controls: MapControls; userPoint?: LatLng; selectedArea?: string | null }) {
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
    <svg
      data-minimap-city=""
      aria-hidden="true"
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
      {you && <MiniYou x={you.x} y={you.y} />}
      <polygon ref={frameRef} fill="color-mix(in oklab, var(--violet) 12%, transparent)" stroke="var(--violet)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The country: the contiguous US, every city open (filled, breathing) or opening (a ring), this city ringed, the
 * visitor, and a dashed line to the nearest open city with how far it is and about how long the drive takes.
 */
function CountryView({ cities, currentSlug, userPoint, onCurrent }: { cities: MapCity[]; currentSlug?: string; userPoint?: LatLng; onCurrent: () => void }) {
  const t = useTranslations('landing.map');
  const open = cities.filter((city) => city.status === 'live');
  // The nearest open city; while none is open yet, the nearest one opening.
  const pool = open.length > 0 ? open : cities;
  const nearest = userPoint && pool.length > 0 ? pool.reduce((best, city) => (distanceMiles(userPoint, city.point) < distanceMiles(userPoint, best.point) ? city : best)) : null;
  const miles = nearest && userPoint ? aboutMiles(distanceMiles(userPoint, nearest.point)) : null;
  const you = userPoint ? projectUS(userPoint) : null;
  // Outside the drawing (abroad, Alaska, Hawaii): no dot, but the distance still shows.
  const youShown = you && you.x >= 0 && you.x <= US_VIEW.width && you.y >= 0 && you.y <= US_VIEW.height ? you : null;
  const to = nearest ? projectUS(nearest.point) : null;
  const minutes = miles !== null ? driveMinutes(miles) : null;
  const trip = minutes === null ? null : minutes < 60 ? t('tripMinutes', { minutes }) : t('tripHours', { hours: Math.round(minutes / 60) });
  const labels = useMemo(() => placeCityLabels(cities, WIDTH), [cities]);
  return (
    <div>
      <div className="relative">
        <svg aria-hidden="true" viewBox={`0 0 ${US_VIEW.width} ${US_VIEW.height}`} width={WIDTH} height={COUNTRY_HEIGHT} className="block rounded-xl bg-[color-mix(in_oklab,var(--map-water)_55%,transparent)]">
          <path d={US_PATH} fill="var(--map-land)" stroke="color-mix(in oklab, var(--foreground) 32%, transparent)" strokeWidth="1.1" strokeLinejoin="round" />
          {youShown && to && <line x1={youShown.x} y1={youShown.y} x2={to.x} y2={to.y} stroke="var(--violet)" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" />}
          {cities.map((city) => {
            const at = projectUS(city.point);
            const isOpen = city.status === 'live';
            return (
              <g key={city.slug}>
                {isOpen && <circle cx={at.x} cy={at.y} r="11" fill="var(--primary)" opacity="0.22" className="motion-safe:animate-pulse" />}
                {city.slug === currentSlug && <circle cx={at.x} cy={at.y} r="10" fill="none" stroke="var(--foreground)" strokeWidth="1.6" />}
                <circle cx={at.x} cy={at.y} r={isOpen ? 5.5 : 4.5} fill={isOpen ? 'var(--primary)' : 'var(--card)'} stroke={isOpen ? '#fff' : 'var(--primary)'} strokeWidth="2" />
              </g>
            );
          })}
          {youShown && <MiniYou x={youShown.x} y={youShown.y} size={1.35} />}
        </svg>
        {/* The cities' names, as links (readable sizes, and reachable by keyboard), each on a free side of its dot. */}
        {labels.map(({ city, box }) => (
          <Link
            key={city.slug}
            href={city.status === 'live' ? routes.market(city.slug) : routes.waitlist()}
            onClick={(event) => {
              if (city.slug !== currentSlug) return;
              event.preventDefault();
              onCurrent();
            }}
            title={city.status === 'live' ? t('minimapOpen', { city: city.name }) : t('minimapSoon', { city: city.name })}
            className={cn(
              'absolute rounded-full px-1.5 text-[10px] leading-4 font-semibold whitespace-nowrap underline-offset-2 hover:underline',
              city.status === 'live' ? 'bg-card/85 text-foreground' : 'bg-card/70 text-muted-foreground',
            )}
            style={{ left: box.left, top: box.top }}
          >
            {city.name}
          </Link>
        ))}
      </div>
      <p className="px-1 pt-1.5 text-[11px] leading-4 text-muted-foreground">
        {miles !== null && nearest && trip ? t('minimapYouFrom', { miles, city: nearest.name, trip }) : t('minimapCities', { count: open.length })}
      </p>
    </div>
  );
}

/** The visitor on a minimap: a violet dot ringed in white, inside the same plus-shaped target as on the big map. */
function MiniYou({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <g fill="none" stroke="var(--violet)" strokeLinecap="round">
        <circle r="5.5" strokeWidth="1.2" />
        <path d="M0 -9.5v3M0 6.5v3M-9.5 0h3M6.5 0h3" strokeWidth="1.5" />
      </g>
      <circle r="2.8" fill="var(--violet)" stroke="#fff" strokeWidth="1.2" />
    </g>
  );
}
