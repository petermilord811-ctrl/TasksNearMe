'use client';

import { Suspense, use, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Bike, Box, Car, ClipboardList, Footprints, House, LocateFixed, Lock, Maximize2, Store, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { NearbyTaskPin, TaskMapBundle, TaskMapData, TaskPlace, TaskSurroundings, TravelMode } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/primitives/dialog';
import { GatedButton } from '@/ui/primitives/gated';
import { Skeleton } from '@/ui/primitives/skeleton';
import { Spinner } from '@/ui/primitives/spinner';
import { useMapTiles } from './map-tiles';
import { StaticAreaMap } from './static-area-map';
import { TaskMapAround, TaskMapNearbyTasks, usePlaceName } from './task-map-around';
import type { TaskMapLiveLabels } from './task-map-live';
import { TaskMapWeather } from './task-map-weather';
import { splitMinutes } from './task-trip';
import { useTaskTrip, type TaskTrip } from './use-task-trip';

const TaskMapLive = dynamic(() => import('./task-map-live').then((module) => module.TaskMapLive), { ssr: false });

const MODE_ICONS: Readonly<Record<TravelMode, LucideIcon>> = { drive: Car, bike: Bike, walk: Footprints };
const NO_PLACES: TaskPlace[] = [];

/**
 * The task map (contracts/task-map.ts; owner, 2026-11-23): one panel on every task page. The task's general area on a
 * live map lit for the hour (the drawn map while it loads, or where WebGL isn't there), the trip there from this
 * device or a helper's home neighborhood (drive, bike and walk times worked out on the device, the route drawn), the
 * weather for the task's time, what's around the area, and for helpers the open tasks nearby. "Open the map large"
 * shows it full screen with 3D buildings, the places and the tasks around.
 */
export function TaskMapPanel({ map, live, className }: { map: TaskMapBundle; /** Previews and tests: the drawn map only. */ live?: boolean; className?: string }) {
  const { data } = map;
  const t = useTranslations('taskMap');
  const tiles = useMapTiles();
  const wantLive = live ?? tiles.live;
  const trip = useTaskTrip(data);
  const [open, setOpen] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const id = useId();
  const label = t('map.label', { area: data.area.name });
  return <div className={cn('space-y-5', className)}>
    <div className="relative">
      <MapFrame data={data} trip={trip} wantLive={wantLive} label={label} className="aspect-[16/11] max-h-80 w-full sm:aspect-[16/9]" places={NO_PLACES} />
      <GatedButton ref={expandButton} type="button" onClick={() => setOpen(true)} className="absolute top-2 right-2 z-10 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-card/95 px-3 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Maximize2 aria-hidden="true" className="size-3.5" />{t('map.expand')}
      </GatedButton>
    </div>
    <p className="-mt-3 flex items-start gap-1.5 text-xs text-muted-foreground"><Lock aria-hidden="true" className="mt-px size-3.5 shrink-0" />{t('map.privacy')}</p>
    <TripControls data={data} trip={trip} headingId={`${id}-trip`} />
    {data.weatherWeight !== 'none' && <Suspense fallback={<SectionSkeleton />}><TaskMapWeather weather={map.weather} weight={data.weatherWeight} headingId={`${id}-weather`} /></Suspense>}
    <Suspense fallback={<SectionSkeleton />}><TaskMapAround surroundings={map.surroundings} headingId={`${id}-around`} /></Suspense>
    <TaskMapNearbyTasks tasks={data.nearbyTasks} headingId={`${id}-nearby`} />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[88dvh] sm:max-w-6xl sm:rounded-[1.75rem]"
        // Opened by state, so Radix has no trigger to give focus back to: the button that opened it gets it.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          expandButton.current?.focus({ preventScroll: true });
        }}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-foreground/[0.07] px-4 py-3 pr-14 sm:px-6 dark:border-white/[0.06]">
          <div className="min-w-0">
            <DialogTitle className="truncate font-display text-lg font-semibold">{data.area.name}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{t('map.dialogDescription')}</DialogDescription>
          </div>
        </div>
        {open && <LargeMap map={map} trip={trip} wantLive={wantLive} label={label} onOpenTask={(href) => { setOpen(false); router.push(href); }} />}
      </DialogContent>
    </Dialog>
  </div>;
}

function SectionSkeleton() {
  return <div className="space-y-2" aria-hidden="true"><Skeleton className="h-4 w-32" /><Skeleton className="h-12 w-full rounded-2xl" /></div>;
}

/** The large map and its controls: the trip, and what the map shows (3D buildings, places, tasks nearby). */
function LargeMap({ map, trip, wantLive, label, onOpenTask }: { map: TaskMapBundle; trip: TaskTrip; wantLive: boolean; label: string; onOpenTask: (href: string) => void }) {
  const t = useTranslations('taskMap.map');
  const { data } = map;
  const [threeD, setThreeD] = useState(false);
  const [showPlaces, setShowPlaces] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const id = useId();
  const toggle = (on: boolean, set: (value: boolean) => void, Icon: LucideIcon, text: string) => <GatedButton type="button" aria-pressed={on} onClick={() => set(!on)} className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', on ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-foreground/[0.1] bg-card text-muted-foreground hover:text-foreground')}><Icon aria-hidden="true" className="size-4" />{text}</GatedButton>;
  return <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1">
    <Suspense fallback={<MapFrame data={data} trip={trip} wantLive={wantLive} label={label} expanded threeD={threeD} places={NO_PLACES} tasks={showTasks ? data.nearbyTasks : []} onOpenTask={onOpenTask} className="h-full min-h-64" square />}>
      <PlacesOn surroundings={map.surroundings}>
        {(places) => <MapFrame data={data} trip={trip} wantLive={wantLive} label={label} expanded threeD={threeD} places={showPlaces ? places : NO_PLACES} tasks={showTasks ? data.nearbyTasks : []} onOpenTask={onOpenTask} className="h-full min-h-64" square />}
      </PlacesOn>
    </Suspense>
    <div className="max-h-[42dvh] space-y-4 overflow-y-auto border-t border-foreground/[0.07] p-4 sm:px-6 lg:max-h-none lg:border-t-0 lg:border-l dark:border-white/[0.06]">
      <div role="group" aria-label={t('layers')} className="flex flex-wrap gap-2">
        {toggle(threeD, setThreeD, Box, t('threeD'))}
        {toggle(showPlaces, setShowPlaces, Store, t('places'))}
        {data.nearbyTasks.length > 0 && toggle(showTasks, setShowTasks, ClipboardList, t('tasks'))}
      </div>
      <TripControls data={data} trip={trip} headingId={`${id}-trip`} />
    </div>
  </div>;
}

function PlacesOn({ surroundings, children }: { surroundings: Promise<TaskSurroundings>; children: (places: TaskPlace[]) => ReactNode }) {
  const result = use(surroundings);
  return children(result.status === 'found' ? [...result.landmarks, ...result.helpful] : NO_PLACES);
}

/**
 * The map itself: the drawn map at once, then (when wanted and about to be seen) the live map fading in over it. In the
 * page it waits until it's near the screen and the page is idle; opened large it loads at once.
 */
function MapFrame({ data, trip, wantLive, label, expanded = false, threeD = false, places, tasks = [], onOpenTask, className, square = false }: {
  data: TaskMapData;
  trip: TaskTrip;
  wantLive: boolean;
  label: string;
  expanded?: boolean;
  threeD?: boolean;
  places: TaskPlace[];
  tasks?: NearbyTaskPin[];
  onOpenTask?: (href: string) => void;
  className?: string;
  square?: boolean;
}) {
  const t = useTranslations('taskMap');
  const common = useTranslations('common');
  const tiles = useMapTiles();
  const placeName = usePlaceName();
  const [live, setLive] = useState<'loading' | 'ready' | 'failed'>(wantLive ? 'loading' : 'failed');
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => expanded || (typeof window !== 'undefined' && typeof IntersectionObserver === 'undefined'));
  useEffect(() => {
    const element = box.current;
    if (!wantLive || near || !element || typeof IntersectionObserver === 'undefined') return;
    let idle = 0;
    const whenIdle = (run: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 2500 }) : window.setTimeout(run, 1200));
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
  const labels: TaskMapLiveLabels = {
    canvas: common('mapKeyboard'),
    twoFingers: common('mapTwoFingers'),
    ctrlZoom: common('mapCtrlZoom'),
    cmdZoom: common('mapCmdZoom'),
    origin: t('map.origin'),
    home: t('map.home'),
    place: placeName,
    task: (task) => t('map.task', { title: task.title, price: task.budget.type === 'fixed' ? formatMoney(task.budget.priceCents) : t('nearby.hourly', { rate: formatMoney(task.budget.rateCents) }), miles: task.miles }),
  };
  const drawn = <StaticAreaMap
    places={[{ id: 'area', point: data.area.point, radiusMeters: data.area.radiusMeters, label: data.area.name, name: label }]}
    fallbackCenter={data.area.point}
    groupLabel={(count) => String(count)}
    className="absolute inset-0"
  />;
  return <div ref={box} role="region" aria-label={label} className={cn('relative isolate overflow-hidden bg-card', square ? '' : 'rounded-2xl border border-foreground/[0.07] dark:border-white/[0.06]', className)}>
    {live !== 'ready' && drawn}
    {near && live !== 'failed' && <TaskMapLive
      styleUrl={tiles.styleUrl}
      area={{ point: data.area.point, radiusMeters: data.area.radiusMeters }}
      origin={trip.origin}
      route={trip.route}
      places={places}
      tasks={tasks}
      threeD={threeD}
      expanded={expanded}
      visible={live === 'ready'}
      labels={labels}
      onReady={() => setLive('ready')}
      onFailed={() => setLive('failed')}
      onRoads={trip.onRoads}
      {...(onOpenTask ? { onOpenTask } : {})}
    />}
    <p className="pointer-events-none absolute right-2 bottom-1 z-10 rounded bg-card/80 px-1.5 text-[10px] text-muted-foreground">{tiles.attribution}</p>
  </div>;
}

/** Where the trip starts, and the drive, bike and walk times from there. */
function TripControls({ data, trip, headingId }: { data: TaskMapData; trip: TaskTrip; headingId: string }) {
  const t = useTranslations('taskMap.trip');
  const { formatTime } = useFormat();
  const { device, origin, trips } = trip;
  const time = (minutes: number) => {
    const parts = splitMinutes(minutes);
    return t('minutes', { hours: parts.hours, minutes: parts.minutes });
  };
  const deviceButton = (text: string) => <GatedButton type="button" onClick={trip.locate} disabled={device.status === 'locating'} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[var(--map-route,#2563eb)] px-3.5 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70">
    {device.status === 'locating' ? <Spinner aria-hidden="true" /> : <LocateFixed aria-hidden="true" className="size-4" />}{text}
  </GatedButton>;
  return <section aria-labelledby={headingId} className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id={headingId} className="text-sm font-semibold">{t('title')}</h3>
      {data.home && <div role="group" aria-label={t('from')} className="inline-flex rounded-full border border-foreground/[0.1] p-0.5 text-[13px]">
        <GatedButton type="button" aria-pressed={origin?.kind === 'device'} onClick={() => { trip.chooseOrigin('device'); if (device.status !== 'found') trip.locate(); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-medium aria-pressed:bg-foreground aria-pressed:text-background focus-visible:outline-2 focus-visible:outline-ring"><LocateFixed aria-hidden="true" className="size-3.5" />{t('fromDevice')}</GatedButton>
        <GatedButton type="button" aria-pressed={origin?.kind === 'home'} onClick={() => trip.chooseOrigin('home')} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-medium aria-pressed:bg-foreground aria-pressed:text-background focus-visible:outline-2 focus-visible:outline-ring"><House aria-hidden="true" className="size-3.5" />{t('fromHome', { area: data.home.name })}</GatedButton>
      </div>}
    </div>
    {!origin || (trip.originChoice === 'device' && device.status !== 'found')
      ? <div className="space-y-2 rounded-2xl bg-secondary/60 p-3.5 dark:bg-secondary/30">
        <p className="text-sm text-muted-foreground" role={device.status === 'denied' || device.status === 'unavailable' ? 'status' : undefined}>
          {device.status === 'denied' ? t('denied') : device.status === 'unavailable' ? t('unavailable') : device.status === 'locating' ? t('locating') : t('useBody')}
        </p>
        {device.status !== 'denied' && deviceButton(device.status === 'unavailable' ? t('retry') : t('use'))}
      </div>
      : <>
        <div
          role="radiogroup"
          aria-label={t('modesLabel')}
          className="grid grid-cols-3 gap-2"
          // One Tab stop for the group; the arrow keys move between the ways of getting there (a radio group's keys).
          onKeyDown={(event) => {
            const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
            if (!step || trips.length === 0) return;
            event.preventDefault();
            const at = trips.findIndex((estimate) => estimate.mode === trip.mode);
            const next = trips[(at + step + trips.length) % trips.length]!;
            trip.chooseMode(next.mode);
            event.currentTarget.querySelector<HTMLButtonElement>(`[data-mode="${next.mode}"]`)?.focus();
          }}
        >
          {trips.map((estimate) => {
            const Icon = MODE_ICONS[estimate.mode];
            const selected = trip.mode === estimate.mode;
            return <GatedButton
              key={estimate.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              data-mode={estimate.mode}
              onClick={() => trip.chooseMode(estimate.mode)}
              className={cn('flex min-h-16 flex-col items-start gap-0.5 rounded-2xl border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', selected ? 'border-[var(--map-route,#2563eb)] bg-[color-mix(in_oklab,var(--map-route,#2563eb)_8%,transparent)]' : 'border-foreground/[0.1] hover:bg-foreground/[0.03]')}
            >
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon aria-hidden="true" className="size-4" />{t(`modes.${estimate.mode}`)}</span>
              <span className="font-display text-lg leading-6 font-semibold tabular-nums">{time(estimate.minutes)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{t('miles', { miles: estimate.miles })}</span>
            </GatedButton>;
          })}
        </div>
        {trip.rushMinutes !== null && trip.mode === 'drive' && <p className="text-sm">{t('rush', { time: formatTime(data.schedule.windowStart), minutes: trip.rushMinutes })}</p>}
        <p className="text-xs text-muted-foreground">{t(origin.kind === 'home' ? 'estimateHome' : 'estimate', { area: data.home?.name ?? '' })}</p>
      </>}
  </section>;
}
