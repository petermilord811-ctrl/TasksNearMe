'use client';

import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
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
        // `overflow-clip`, not `hidden`: clipping without becoming a scroll container keeps the explorer's sticky
        // position working against the page. The third column is wider than the panel, which sits at its end.
        className="relative grid scroll-mt-20 grid-cols-1 lg:z-[2] lg:min-h-[max(60rem,108svh)] lg:grid-cols-[minmax(var(--page-gutter),1fr)_minmax(0,38rem)_minmax(0,31rem)_minmax(var(--page-gutter),1fr)] lg:gap-x-10 lg:overflow-clip lg:rounded-t-[2.75rem] lg:paper lg:shadow-[0_-34px_70px_-44px_rgb(0_0_0/0.42)] dark:lg:shadow-[0_-34px_80px_-40px_rgb(0_0_0/0.9),0_-18px_60px_-34px_color-mix(in_oklab,var(--iri-3)_40%,transparent)]"
      >
        {/* The sheet's edge, so it reads as a sheet sliding over the town in both themes (on dark paper a shadow
            alone vanishes): a hairline that follows the rounded corners, brightest in the middle where an
            iridescent line runs along it. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[4] hidden h-16 rounded-t-[2.75rem] shadow-[inset_0_1px_0_rgb(255_255_255/0.7)] lg:block dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.13)]" />
        <div aria-hidden="true" className="pointer-events-none absolute top-0 left-1/2 z-[4] hidden h-px w-[min(56rem,62%)] -translate-x-1/2 opacity-55 lg:block dark:opacity-90" style={{ background: 'linear-gradient(90deg, transparent, var(--iri-1) 22%, var(--iri-2) 50%, var(--iri-3) 78%, transparent)' }} />
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
                  <span>{t('outside')}</span>{' '}
                  <Link href={routes.waitlist()} className="font-semibold text-primary underline-offset-4 hover:underline">{t('waitlist')}</Link>
                  {' · '}
                  <Link href={routes.becomeAHelper()} className="font-semibold text-primary underline-offset-4 hover:underline">{t('outsideHelpers')}</Link>
                </p>
              )}
            </div>
          </Reveal>
        </div>

        {/* The explorer: find, pick a category, order and narrow, see how many, and the tasks themselves (the map's
            accessible twin). On wide screens it keeps one size whatever the list holds (its rows scroll in a
            fixed viewport), and it stays in view while the map scrolls past: it sticks just under the top bar
            (following the bar as it slips away and comes back) and leaves with the section's end. */}
        <div className="relative order-3 px-gutter pt-6 pb-16 sm:pb-20 lg:sticky lg:top-[calc(var(--top-bar-offset,5.5rem)+1rem)] lg:order-none lg:col-start-3 lg:row-start-1 lg:mt-[max(6.5rem,8vw)] lg:mb-10 lg:w-[min(100%,26.5rem)] lg:self-start lg:justify-self-end lg:px-0 lg:py-0 lg:transition-[top] lg:duration-500 lg:ease-[var(--ease-out)]">
          <Reveal variant="bloom" origin="100% 50%" className="lg:glass lg:rounded-[1.75rem] lg:p-2.5">
            <SmartSearch />
            <ChipScroller className="mt-2">
              <CategoryFilter />
            </ChipScroller>
            <ExplorerTools data={data} />
            <div className="lg:px-1.5"><OpenCount data={data} /></div>
            <div {...{ [LIST_VIEWPORT_ATTRIBUTE]: '' }} className="lg:h-[min(21rem,calc(100svh-25rem))] lg:min-h-[13rem] lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:thin]">
              <NearbyList map={data.map} fill={wide} />
            </div>
            {data.map.pins.length > 0 && (
              <div className="mt-1 px-3 lg:-mb-1">
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

/**
 * One sideways row for the category chips (it used to wrap to three rows on wide screens): no scrollbar, and an
 * end fades only while there's more that way, so a chip cut at the edge reads as "scroll for more". A picked chip
 * that sits partly outside glides into view.
 */
function ChipScroller({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: true });
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const max = row.scrollWidth - row.clientWidth;
      setEnds({ start: row.scrollLeft <= 2, end: row.scrollLeft >= max - 2 });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    row.addEventListener('scroll', schedule, { passive: true });
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    sized?.observe(row);
    // A pick (by click, by the smart search or from the hero) brings its chip fully into view.
    const picked = new MutationObserver(() => {
      const chip = row.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!chip) return;
      const box = row.getBoundingClientRect();
      const rect = chip.getBoundingClientRect();
      const pad = 28;
      if (rect.left < box.left + pad) row.scrollBy?.({ left: rect.left - box.left - pad, behavior: 'smooth' });
      else if (rect.right > box.right - pad) row.scrollBy?.({ left: rect.right - box.right + pad, behavior: 'smooth' });
    });
    picked.observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
    return () => {
      cancelAnimationFrame(frame);
      row.removeEventListener('scroll', schedule);
      sized?.disconnect();
      picked.disconnect();
    };
  }, []);
  const fade = `linear-gradient(to right, ${ends.start ? '#000' : 'transparent'}, #000 1.75rem, #000 calc(100% - 2.5rem), ${ends.end ? '#000' : 'transparent'})`;
  return (
    <div
      ref={ref}
      className={cn('-mx-gutter overflow-x-auto overscroll-x-contain px-gutter py-0.5 [scrollbar-width:none] lg:mx-0 lg:px-1 [&::-webkit-scrollbar]:hidden', className)}
      style={{ maskImage: fade, WebkitMaskImage: fade }}
    >
      {children}
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
    <div role="group" aria-label={t('filterLabel')} className="flex w-max gap-1.5">
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
              'relative isolate inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-[border-color,color,transform] duration-300 active:scale-[0.96] lg:min-h-10 lg:gap-1.5 lg:px-3 lg:text-[13px]',
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
  const select = 'min-h-11 cursor-pointer appearance-none rounded-full bg-transparent py-2 pr-8 pl-9 text-base font-medium outline-none sm:text-sm lg:min-h-10 lg:pr-7 lg:pl-8 lg:text-[13px]';

  return (
    <div className="mt-1.5 space-y-2 lg:px-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className={field}>
          <ArrowDownUp aria-hidden="true" className="pointer-events-none absolute left-3.5 size-3.5 text-muted-foreground lg:left-3" />
          <span className="sr-only">{t('sortLabel')}</span>
          <select value={sort} onChange={(event) => explorer.setSortChoice(event.target.value as ListSort)} className={select}>
            <option value="newest">{t('sortNewest')}</option>
            <option value="nearest" disabled={!from}>{t('sortNearest')}</option>
            <option value="pay">{t('sortPay')}</option>
            <option value="price">{t('sortPrice')}</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 size-3.5 text-muted-foreground lg:right-2.5" />
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
                  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-medium tabular-nums transition-[background-color,border-color,color] duration-200 lg:min-h-9 lg:min-w-9 lg:text-[13px]',
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
 * Whether the list follows the map: only meaningful once the live map is up. Until then it keeps its room
 * (hidden), so nothing shifts when it comes.
 */
function FollowMapSwitch() {
  const t = useTranslations('landing.map');
  const explorer = useMapExplorer();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={explorer.followMap}
      aria-label={t('followMapLabel')}
      title={t('followMapLabel')}
      onClick={() => explorer.setFollowMap(!explorer.followMap)}
      className={cn(
        '-mr-1 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full pr-1.5 pl-2 text-xs font-medium text-foreground/80 transition-[color,opacity] duration-500 hover:text-foreground lg:min-h-10',
        !explorer.liveReady && 'invisible opacity-0',
      )}
    >
      <span aria-hidden="true" className={cn('relative h-5 w-8 shrink-0 rounded-full transition-colors duration-300', explorer.followMap ? 'bg-violet' : 'bg-foreground/15')}>
        <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-300 ease-[var(--ease-out)]', explorer.followMap && 'translate-x-3')} />
      </span>
      {t('followMap')}
    </button>
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
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-foreground/10 bg-card/70 pr-3 pl-3.5 text-base font-medium transition-colors hover:border-foreground/25 sm:text-sm lg:min-h-10 lg:gap-1.5 lg:pr-2.5 lg:pl-3 lg:text-[13px]"
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
  const from = location.status === 'granted' ? location.point : undefined;
  const bounds = explorer.followMap ? explorer.view : null;
  const withinMiles = from ? explorer.withinMiles : null;
  const shown = bounds || withinMiles ? nearbyPins(data.map.pins, { from, category: selectedCategory, withinMiles, bounds }).length : count;
  const total = selectedCategory ? t('countCategory', { category: categories(selectedCategory), count }) : t('countAll', { count, market: data.market.name });
  // How many of them the list shows (on the map, or within the distance) rides on the same line.
  const text = shown < count ? `${total} · ${t('inView', { shown, total: count })}` : total;

  return (
    <div className="mt-1 flex min-h-10 items-center gap-2">
      <p role="status" aria-live="polite" className="relative h-6 min-w-0 flex-1 overflow-hidden text-sm font-medium text-muted-foreground">
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
      <FollowMapSwitch />
    </div>
  );
}
