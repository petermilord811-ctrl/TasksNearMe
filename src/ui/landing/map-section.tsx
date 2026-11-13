'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ArrowDownUp, ChevronDown, LocateFixed, Loader2, MapPin, Navigation, ShieldCheck, Sparkles, X } from 'lucide-react';
import { CATEGORY_SLUGS, routes, type CategorySlug, type HomePageData, type MapArea } from '@/contracts';
import { readTaskIntent } from '@/shared/task-intent';
import { Reveal, spring, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from './category-icons';
import { MAP_SECTION_ID, useLanding } from './landing-state';
import { MapExplorerProvider, useMapExplorer } from './map/explorer-state';
import { effectiveSort, insideServiceArea, nearbyPins, type ListSort } from './map/map-math';
import { LIST_VIEWPORT_ATTRIBUTE, NearbyList } from './map/nearby-list';
import { TaskMap, type MapMode } from './map/task-map';

/** Room the panels take over the full-width map on wide screens (fractions of the map): the camera stays clear. */
const WIDE_PADDING = { top: 0.5, right: 0.38, bottom: 0.14, left: 0.09 };
const DISTANCES = [1, 3, 5] as const;

/**
 * Tasks near you: the real map, full width, right under the hero's town, with the heading over its top-left
 * and the explorer (find in your own words, the category filter, the order, the distance, a neighborhood to
 * go to, the count and the list) in a glass panel on its right. On phones: the heading, the map, then the
 * explorer. The map continues the hero: it opens close and tilted over the town's first task and, as the
 * section scrolls into place, pulls back and flattens into the whole city. "Use my location" asks only on
 * press; the location stays on this device. One click moves everything together: the filter's pill slides to
 * the pick, the count rolls to the new number, the list glides into its new order, the map flies to those
 * tasks, and the town's pins quiet down to the category.
 */
export function MapSection({ data, mapMode }: { data: HomePageData; mapMode: MapMode }) {
  return (
    <MapExplorerProvider>
      <AreaBridge />
      <MapSectionContent data={data} mapMode={mapMode} />
    </MapExplorerProvider>
  );
}

/**
 * A neighborhood picked anywhere (the hero's market line, or the explorer's picker) is one shared pick: each
 * pick flies the live map there (a request waits for the map if it isn't up yet).
 */
function AreaBridge() {
  const { area, areaPicks } = useLanding();
  const { requestFocus } = useMapExplorer();
  const handled = useRef(areaPicks);
  useEffect(() => {
    if (areaPicks === handled.current) return;
    handled.current = areaPicks;
    if (area) requestFocus({ kind: 'area', point: area.point });
  }, [area, areaPicks, requestFocus]);
  return null;
}

function MapSectionContent({ data, mapMode }: { data: HomePageData; mapMode: MapMode }) {
  const t = useTranslations('landing.map');
  const { location, requestLocation } = useLanding();
  const reduced = usePrefersReducedMotion();
  const market = data.market.name;
  const outside = location.status === 'granted' && !insideServiceArea(data.map, location.point);
  const wide = useMediaQuery('(min-width: 1024px)');
  // The map opens on the hero's first task (the town's first card), so the story carries on from there.
  const arrival = useMemo(() => {
    const onMap = new Map(data.map.pins.map((pin) => [pin.id, pin]));
    const fromHero = data.recentTasks.find((task) => task.location.kind === 'local' && onMap.has(task.id));
    const pin = (fromHero ? onMap.get(fromHero.id) : undefined) ?? data.map.pins[0];
    return pin ? { taskId: pin.id, point: pin.point } : null;
  }, [data.map.pins, data.recentTasks]);
  const sheetRef = useAlignedPaper();

  return (
    <LazyMotion features={domMax}>
      <section
        ref={sheetRef}
        id={MAP_SECTION_ID}
        aria-labelledby="map-title"
        className="relative grid scroll-mt-20 grid-cols-1 lg:z-[2] lg:min-h-[max(60rem,108svh)] lg:grid-cols-[minmax(var(--page-gutter),1fr)_minmax(0,40rem)_minmax(0,28.5rem)_minmax(var(--page-gutter),1fr)] lg:gap-x-10 lg:overflow-hidden lg:rounded-t-[2.75rem] lg:paper lg:shadow-[0_-34px_70px_-44px_rgb(0_0_0/0.42)]"
      >
        {/* The real map: between the heading and the list on phones, under everything on wide screens. */}
        <div className="relative order-2 mt-6 h-[72svh] max-h-[40rem] min-h-[26rem] lg:absolute lg:inset-0 lg:order-none lg:mt-0 lg:h-auto lg:max-h-none">
          <figure className="m-0 size-full">
            <p className="sr-only">{t('mapLabel', { market })}</p>
            <TaskMap
              map={data.map}
              market={market}
              mode={mapMode}
              variant="fill"
              padding={wide ? WIDE_PADDING : undefined}
              arrival={arrival}
              controlsClassName="right-[var(--page-gutter)] bottom-[16%] lg:top-[max(29rem,44%)] lg:right-auto lg:bottom-auto lg:left-[max(var(--page-gutter),calc(50%-35.5rem))] lg:items-start"
            />
            <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex flex-wrap items-center justify-between gap-2 px-gutter pb-2 text-xs text-muted-foreground lg:mx-auto lg:max-w-[78rem] lg:pb-[3.5%]">
              <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden="true" className="size-3.5" />{t('caption')}</span>
              <span>{data.map.attribution}</span>
            </figcaption>
          </figure>
          {/* Paper behind the heading, so it reads over the map; it melts into the map with no edge. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block" style={{ background: 'radial-gradient(50% 36% at 6% 20%, var(--background) 42%, color-mix(in oklab, var(--background) 70%, transparent) 60%, transparent 82%)' }} />
        </div>

        <div className="relative order-1 px-gutter pt-14 sm:pt-20 lg:pointer-events-none lg:order-none lg:col-start-2 lg:row-start-1 lg:px-0 lg:pt-[max(9rem,11vw)]">
          <Reveal className="max-w-xl lg:pointer-events-auto">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{t('eyebrow')}</p>
            <h2 id="map-title" className="mt-3 font-display text-4xl leading-[1.02] font-semibold tracking-[-0.035em] sm:text-5xl">
              {t('title')} <span className="font-accent font-normal tracking-[-0.01em] text-violet italic">{t('titleAccent')}</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">{t('body', { market })}</p>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <m.button
                layout
                transition={reduced ? { duration: 0 } : spring.bloom}
                type="button"
                onClick={requestLocation}
                disabled={location.status === 'locating'}
                // Given as a style so Motion keeps the pill's corners round while it resizes.
                style={{ borderRadius: 9999 }}
                className={cn(
                  'inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-[background-color,box-shadow,color] duration-300 active:scale-[0.97] disabled:opacity-70',
                  location.status === 'granted' ? 'glass text-foreground' : 'bg-foreground text-background hover:shadow-[0_12px_28px_-12px_rgb(0_0_0/0.45)]',
                )}
              >
                <m.span layout="position" className="inline-flex items-center gap-2">
                  {location.status === 'locating' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <LocateFixed aria-hidden="true" className="size-4" />}
                  {location.status === 'locating' ? t('locating') : location.status === 'granted' ? t('nearYou') : t('useLocation')}
                </m.span>
              </m.button>
              <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-3.5" />{t('privacy')}</p>
            </div>
            <div role="status" aria-live="polite" className="mt-3 min-h-6 text-sm">
              {location.status === 'denied' && <p className="text-muted-foreground">{t('denied', { market })}</p>}
              {location.status === 'unavailable' && <p className="text-muted-foreground">{t('unavailable', { market })}</p>}
              {outside && (
                <p className="text-foreground">
                  {t('outside')}{' '}
                  <Link href={routes.waitlist()} className="font-semibold text-primary underline-offset-4 hover:underline">{t('waitlist')}</Link>
                </p>
              )}
            </div>
          </Reveal>
        </div>

        {/* The explorer: find, pick a category, order and narrow, see how many, and the tasks themselves (the map's
            accessible twin). On wide screens it keeps one size whatever the list holds (its rows scroll in a
            fixed viewport), anchored at its top, so moving the map never moves the panel or the page. */}
        <div className="relative order-3 px-gutter pt-6 pb-16 sm:pb-20 lg:order-none lg:col-start-3 lg:row-start-1 lg:self-start lg:px-0 lg:pt-[max(7rem,9vw)] lg:pb-[max(6rem,8vw)]">
          <Reveal variant="bloom" origin="100% 50%" className="lg:glass lg:rounded-[2rem] lg:p-3">
            <SmartSearch />
            <div className="-mx-gutter mt-3 overflow-x-auto px-gutter pb-1 [scrollbar-width:none] lg:mx-0 lg:overflow-visible lg:px-1.5">
              <CategoryFilter />
            </div>
            <ExplorerTools data={data} />
            <div className="lg:px-2"><OpenCount data={data} /></div>
            <div {...{ [LIST_VIEWPORT_ATTRIBUTE]: '' }} className="mt-1 lg:h-[min(27rem,46svh)] lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:thin]">
              <NearbyList map={data.map} fill={wide} />
            </div>
            {data.map.pins.length > 0 && (
              <div className="mt-2 px-3.5 lg:pb-1">
                <Link href={routes.taskBoard(data.market.slug)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('browseAll')}</Link>
              </div>
            )}
          </Reveal>
        </div>
      </section>
    </LazyMotion>
  );
}

/**
 * Wide screens: the map's sheet has its own paper (it must hide the pinned hero it slides over), so its marble
 * is lined up with the page's: where the sheet ends, the veins carry on into the sections below with no seam.
 */
function useAlignedPaper() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const sheet = ref.current;
    const page = sheet?.parentElement?.closest<HTMLElement>('.paper');
    if (!sheet || !page) return;
    let frame = 0;
    const align = () => {
      frame = 0;
      // Both boxes move together as the page scrolls, so their difference is the sheet's place on the page.
      const offset = Math.round(sheet.getBoundingClientRect().top - page.getBoundingClientRect().top);
      sheet.style.backgroundPosition = `50% ${-offset}px`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(align);
    };
    align();
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    sized?.observe(page);
    if (sheet.previousElementSibling) sized?.observe(sheet.previousElementSibling);
    return () => {
      cancelAnimationFrame(frame);
      sized?.disconnect();
      sheet.style.removeProperty('background-position');
    };
  }, []);
  return ref;
}

/** Whether a media query matches (false on the server and before hydration). */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Find tasks in your own words: "I have a truck" picks moving help, "good with computers" picks computer help.
 * A pick here is the same as a click on the filter, so the list, the map and the town's pins all follow.
 */
function SmartSearch() {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory, selectCategory } = useLanding();
  const [text, setText] = useState('');
  const [matched, setMatched] = useState<CategorySlug | null>(null);
  const typed = text.trim().length >= 3;

  // Apply the match a moment after typing stops (not on every key).
  useEffect(() => {
    if (!typed) return;
    const timer = window.setTimeout(() => {
      const intent = readTaskIntent(text);
      setMatched(intent.category);
      if (intent.category) selectCategory(intent.category);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text, typed, selectCategory]);

  const showing = typed && matched && matched === selectedCategory ? matched : null;
  return (
    <div className="lg:px-1.5 lg:pt-1.5">
      <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-foreground/10 bg-card/80 px-3.5 transition-[border-color,box-shadow] focus-within:border-violet/40 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--violet)_14%,transparent)]">
        <Sparkles aria-hidden="true" className="size-4 shrink-0 text-violet" />
        <span className="sr-only">{t('smartLabel')}</span>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('smartPlaceholder')}
          maxLength={120}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {text && (
          <button
            type="button"
            onClick={() => {
              setText('');
              setMatched(null);
              selectCategory(null);
            }}
            aria-label={t('smartClear')}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </label>
      <p role="status" aria-live="polite" className="mt-1.5 min-h-5 px-1 text-xs text-muted-foreground">
        {typed && showing && (
          <>
            {t('smartShowing', { category: categories(showing) })}{' '}
            <button
              type="button"
              onClick={() => {
                setText('');
                setMatched(null);
                selectCategory(null);
              }}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t('smartClear')}
            </button>
          </>
        )}
        {typed && matched === null && !showing && t('smartNone')}
      </p>
    </div>
  );
}

/** The filter: "All" and each category. The picked one wears a pill that slides from the last pick. */
function CategoryFilter() {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory, selectCategory, setPreviewCategory } = useLanding();
  const reduced = usePrefersReducedMotion();
  const pillId = useId();
  const options: (CategorySlug | null)[] = [null, ...CATEGORY_SLUGS];

  return (
    <div role="group" aria-label={t('filterLabel')} className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
      {options.map((category) => {
        const on = selectedCategory === category;
        const Icon = category ? CATEGORY_ICONS[category] : null;
        return (
          <button
            key={category ?? 'all'}
            type="button"
            aria-pressed={on}
            onClick={() => selectCategory(on && category ? null : category)}
            onPointerEnter={() => category && setPreviewCategory(category)}
            onPointerLeave={() => setPreviewCategory(null)}
            className={cn(
              'relative isolate inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-[border-color,color,transform] duration-300 active:scale-[0.96] lg:gap-1.5 lg:px-3 lg:text-[13px]',
              on ? 'border-transparent' : 'border-foreground/10 bg-card/60 hover:border-foreground/25',
              on && (category ? 'text-white' : 'text-background'),
            )}
          >
            {on && (
              <m.span
                layoutId={pillId}
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full shadow-[0_10px_24px_-14px_rgb(0_0_0/0.55)]"
                style={{ background: category ? `var(--cat-${category})` : 'var(--foreground)' }}
                transition={reduced ? { duration: 0 } : spring.bloom}
              />
            )}
            {Icon && <Icon aria-hidden="true" className="size-4 transition-colors duration-300" style={on ? undefined : { color: `var(--cat-${category})` }} />}
            {category ? categories(category) : t('all')}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Ordering and narrowing the list: newest, nearest (once the visitor shared a location) or lowest price; a
 * distance from the visitor; a neighborhood to go to on the map; and whether the list follows the map. The map
 * controls appear once the live map is up.
 */
function ExplorerTools({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.map');
  const { location, area, pickArea } = useLanding();
  const explorer = useMapExplorer();
  const from = location.status === 'granted' ? location.point : undefined;
  const sort = effectiveSort(explorer.sortChoice ?? undefined, from);
  const field = 'relative inline-flex min-h-11 items-center rounded-full border border-foreground/10 bg-card/70 text-sm transition-colors focus-within:border-violet/40 hover:border-foreground/25';
  const select = 'min-h-11 cursor-pointer appearance-none rounded-full bg-transparent py-2 pr-8 pl-9 text-base font-medium outline-none sm:text-sm';

  return (
    <div className="mt-2 space-y-2 lg:px-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className={field}>
          <ArrowDownUp aria-hidden="true" className="pointer-events-none absolute left-3.5 size-3.5 text-muted-foreground" />
          <span className="sr-only">{t('sortLabel')}</span>
          <select value={sort} onChange={(event) => explorer.setSortChoice(event.target.value as ListSort)} className={select}>
            <option value="newest">{t('sortNewest')}</option>
            <option value="nearest" disabled={!from}>{t('sortNearest')}</option>
            <option value="price">{t('sortPrice')}</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 size-3.5 text-muted-foreground" />
        </label>
        {/* There from the start (a pick before the live map is up waits for it), so nothing shifts when it comes. */}
        {data.map.areas.length > 0 && <NeighborhoodPicker areas={data.map.areas} current={area} onPick={pickArea} />}
      </div>
      {from && (
        <div role="group" aria-label={t('withinLabel')} className="flex flex-wrap items-center gap-1.5">
          <span aria-hidden="true" className="mr-1 text-xs font-medium text-muted-foreground">{t('withinLabel')}</span>
          {[...DISTANCES, null].map((miles) => {
            const on = explorer.withinMiles === miles;
            return (
              <button
                key={miles ?? 'any'}
                type="button"
                aria-pressed={on}
                onClick={() => explorer.setWithinMiles(miles)}
                className={cn(
                  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-medium tabular-nums transition-[background-color,border-color,color] duration-200',
                  on ? 'border-transparent bg-violet text-white' : 'border-foreground/10 bg-card/60 hover:border-foreground/25',
                )}
              >
                {miles ? t('withinMiles', { miles }) : t('withinAny')}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * "Go to a neighborhood": a button that opens the market's neighborhoods; a pick flies the map there (the same
 * pick as the hero's market line, so the button then names it). The names exist on the page only while it's
 * open (the coverage section is where they're listed for reading).
 */
function NeighborhoodPicker({ areas, current, onPick }: { areas: MapArea[]; current: MapArea | null; onPick: (area: MapArea) => void }) {
  const t = useTranslations('landing.map');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLButtonElement>('[data-area]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={t('jumpLabel')}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-foreground/10 bg-card/70 pr-3 pl-3.5 text-base font-medium transition-colors hover:border-foreground/25 sm:text-sm"
      >
        <Navigation aria-hidden="true" className="size-3.5 text-muted-foreground" />
        {current?.name ?? t('jumpPlaceholder')}
        <ChevronDown aria-hidden="true" className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={listId} role="group" aria-label={t('jumpLabel')} className="glass absolute top-[calc(100%+0.5rem)] left-0 z-30 grid max-h-72 w-60 grid-cols-1 overflow-y-auto rounded-2xl p-1.5 shadow-overlay">
          {areas.map((area) => (
            <button
              key={area.name}
              type="button"
              data-area=""
              onClick={() => {
                onPick(area);
                setOpen(false);
              }}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06]"
            >
              <MapPin aria-hidden="true" className="size-3.5 text-muted-foreground" />
              {area.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * How many open tasks the pick shows, rolling to the new number; announced politely. Then how many the list shows
 * (on the map, or within the distance), on a line that always keeps its room, so the panel never changes size.
 */
function OpenCount({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory, location } = useLanding();
  const explorer = useMapExplorer();
  const reduced = usePrefersReducedMotion();
  const count = selectedCategory ? data.map.pins.filter((pin) => pin.categorySlug === selectedCategory).length : data.map.pins.length;
  const text = selectedCategory ? t('countCategory', { category: categories(selectedCategory), count }) : t('countAll', { count, market: data.market.name });
  const from = location.status === 'granted' ? location.point : undefined;
  const bounds = explorer.followMap ? explorer.view : null;
  const withinMiles = from ? explorer.withinMiles : null;
  const shown = bounds || withinMiles ? nearbyPins(data.map.pins, { from, category: selectedCategory, withinMiles, bounds }).length : count;

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
      <p role="status" aria-live="polite" className="relative h-6 min-w-[12rem] flex-1 overflow-hidden text-sm font-medium text-muted-foreground">
        <AnimatePresence initial={false} mode="popLayout">
          <m.span
            key={text}
            className="absolute inset-x-0 top-0 block truncate"
            initial={reduced ? false : { y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { y: '-100%', opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {text}
          </m.span>
        </AnimatePresence>
      </p>
      {/* Only meaningful with the live map; it keeps its room before then (hidden), so nothing shifts when it comes. */}
      <button
        type="button"
        role="switch"
        aria-checked={explorer.followMap}
        onClick={() => explorer.setFollowMap(!explorer.followMap)}
        className={cn(
          '-mr-1 inline-flex min-h-11 items-center gap-2 rounded-full px-1.5 text-xs font-medium text-foreground/80 transition-[color,opacity] duration-500 hover:text-foreground',
          !explorer.liveReady && 'invisible opacity-0',
        )}
      >
        <span aria-hidden="true" className={cn('relative h-5 w-8 shrink-0 rounded-full transition-colors duration-300', explorer.followMap ? 'bg-violet' : 'bg-foreground/15')}>
          <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-300 ease-[var(--ease-out)]', explorer.followMap && 'translate-x-3')} />
        </span>
        {t('followMap')}
      </button>
      <p className="relative h-5 w-full overflow-hidden text-xs font-medium text-violet tabular-nums">
        <AnimatePresence initial={false}>
          {shown < count && (
            <m.span
              key={`${shown}-${count}`}
              className="absolute inset-x-0 top-0 block truncate"
              initial={reduced ? false : { y: '70%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { y: '-70%', opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {t('inView', { shown, total: count })}
            </m.span>
          )}
        </AnimatePresence>
      </p>
    </div>
  );
}
