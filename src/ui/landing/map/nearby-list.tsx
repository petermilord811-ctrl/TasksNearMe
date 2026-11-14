'use client';

import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { AnimatePresence, LazyMotion, domMax, m, useIsPresent } from 'motion/react';
import { useTranslations } from 'next-intl';
import { LocateFixed } from 'lucide-react';
import { routes, type LandingMapData } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { spring, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from '../category-icons';
import { useLanding } from '../landing-state';
import { MAP_FRAME_ATTRIBUTE, useOptionalMapExplorer } from './explorer-state';
import { effectiveSort, nearbyPins } from './map-math';
import { pinPrice } from './pin-card';

const EASE = [0.22, 1, 0.36, 1] as const;
/** Marks the element the list scrolls in (wide screens), so a new set of rows can start from the top. */
export const LIST_VIEWPORT_ATTRIBUTE = 'data-list-viewport';
/** Leaving a row waits this long before the map lets go of its task, so moving to the next row doesn't flicker. */
const LEAVE_GRACE_MS = 120;

/**
 * The tasks beside the map, and the accessible version of it: real links, in order. Hovering or focusing
 * one lights its pin on the map (and the map's hover lights it here); keyboard focus also brings an out-of-sight
 * task into view, but pointing never moves the map. Each row's pin button shows that task on the map and opens
 * its card. It follows the explorer: the picked category, the chosen distance, what's on the map (when the list
 * follows it, once the map has come to rest), and the order (newest, nearest once the visitor shares a
 * location, or lowest price). When any of that changes, rows glide to their new places, leaving rows fade
 * out and new ones rise in, one after another.
 *
 * `fill`: the list sits in a fixed-height viewport (wide screens; the empty state takes its top), so the panel
 * around it never changes size. Otherwise (phones) the list is in the page's flow and its height eases to each
 * new size instead of jumping.
 */
export function NearbyList({ map, limit = 7, fill = false, className }: { map: LandingMapData; limit?: number; fill?: boolean; className?: string }) {
  const { formatDate } = useFormat();
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory, litTaskId, highlightedTaskId, focusedTaskId, setHighlightedTaskId, pickTask, location } = useLanding();
  const explorer = useOptionalMapExplorer();
  const reduced = usePrefersReducedMotion();
  const from = location.status === 'granted' ? location.point : undefined;
  const sort = effectiveSort(explorer?.sortChoice ?? undefined, from);
  const withinMiles = from ? (explorer?.withinMiles ?? null) : null;
  const bounds = explorer?.followMap ? explorer.view : null;
  const rows = useMemo(
    () => nearbyPins(map.pins, { from, category: selectedCategory, limit, sort, withinMiles, bounds }),
    [map.pins, from, selectedCategory, limit, sort, withinMiles, bounds],
  );
  // Narrowed to nothing by the distance or the map (there are tasks, just not here): offer to widen.
  const narrowed = rows.length === 0 && nearbyPins(map.pins, { category: selectedCategory, limit: 1 }).length > 0;
  const glide = reduced ? { duration: 0 } : spring.bloom;
  const listLabel = sort === 'nearest' ? t('listNearYou') : sort === 'price' ? t('listByPrice') : sort === 'pay' ? t('listByPay') : t('listNewest');
  const rootRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  // The task this list lit, and what's lit now: letting go clears only our own (the map may have lit another since).
  const ours = useRef<string | null>(null);
  const highlighted = useRef(highlightedTaskId);
  useEffect(() => {
    highlighted.current = highlightedTaskId;
  });

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  const point = (id: string) => {
    window.clearTimeout(leaveTimer.current);
    ours.current = id;
    setHighlightedTaskId(id);
  };
  const letGo = () => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      if (ours.current !== null && highlighted.current === ours.current) setHighlightedTaskId(null);
      ours.current = null;
    }, LEAVE_GRACE_MS);
  };
  // Keyboard focus (not a click) may bring the task into view on the map.
  const focusRow = (event: FocusEvent<HTMLElement>, id: string) => {
    point(id);
    let keyboard = false;
    try {
      keyboard = event.currentTarget.matches(':focus-visible');
    } catch {
      /* an engine without :focus-visible */
    }
    if (keyboard) explorer?.requestFocus({ kind: 'peek', id });
  };

  // A new set of rows (not just a new order) starts from the top of its viewport.
  const ids = rows.map(({ pin }) => pin.id);
  const setKey = [...ids].sort().join('|');
  const lastSet = useRef(setKey);
  useEffect(() => {
    if (lastSet.current === setKey) return;
    lastSet.current = setKey;
    const viewport = rootRef.current?.closest<HTMLElement>(`[${LIST_VIEWPORT_ATTRIBUTE}]`);
    if (viewport && viewport.scrollTop > 0) viewport.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }, [setKey, reduced]);

  const showOnMap = (id: string) => {
    pickTask(id);
    explorer?.requestFocus({ kind: 'task', id });
    const frame = document.querySelector(`[${MAP_FRAME_ATTRIBUTE}]`);
    const box = frame?.getBoundingClientRect();
    if (frame && box && (box.bottom < 80 || box.top > window.innerHeight * 0.6)) {
      frame.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }
  };

  const content = (
    <AnimatePresence mode="wait" initial={false}>
      {rows.length === 0 ? (
        <m.div
          key={`empty-${selectedCategory ?? 'all'}-${narrowed ? 'narrowed' : 'none'}`}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, transition: { duration: 0.16 } }}
          transition={{ duration: 0.32, ease: EASE }}
          className={cn('glass rounded-3xl p-6 text-center', fill && 'mt-2')}
        >
          {narrowed ? (
            <>
              <p className="font-display text-lg font-semibold">{withinMiles ? t('emptyWithinTitle', { miles: withinMiles }) : t('emptyInViewTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('emptyFilteredBody')}</p>
              <button
                type="button"
                onClick={() => {
                  explorer?.setWithinMiles(null);
                  explorer?.setFollowMap(false);
                }}
                className="mt-4 inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-transform active:scale-[0.97]"
              >
                {t('showEverything')}
              </button>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-semibold">{selectedCategory ? t('emptyCategoryTitle', { category: categories(selectedCategory) }) : t('emptyTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('emptyBody')}</p>
              <Link href={routes.app.newTask(selectedCategory ? { category: selectedCategory } : {})} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform hover:bg-primary-hover active:scale-[0.97]">
                {t('postFirst')}
              </Link>
            </>
          )}
        </m.div>
      ) : (
        <m.ol
          key="list"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.24, ease: EASE } }}
          // Under reduced motion it leaves at once (the empty state takes its place in the same render).
          exit={reduced ? undefined : { opacity: 0, transition: { duration: 0.14 } }}
          className="relative space-y-2"
          aria-label={listLabel}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map(({ pin, miles }, index) => {
              const lit = pin.id === litTaskId;
              const picked = pin.id === focusedTaskId;
              const Icon = CATEGORY_ICONS[pin.categorySlug];
              return (
                <m.li
                  key={pin.id}
                  layout={reduced ? false : 'position'}
                  initial={reduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.34, ease: EASE, delay: reduced ? 0 : Math.min(index, 6) * 0.035 } }}
                  exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.15, ease: EASE } }}
                  transition={{ layout: glide }}
                >
                  <Leaving>
                    <div
                      onPointerEnter={() => point(pin.id)}
                      onPointerLeave={letGo}
                      className={cn(
                        'group/row relative flex items-center rounded-2xl border pr-1 transition-[background-color,border-color,box-shadow,translate] duration-300 ease-[var(--ease-out)]',
                        lit ? '-translate-y-px border-foreground/[0.07] bg-card shadow-[0_12px_28px_-18px_rgb(0_0_0/0.5)]' : 'border-transparent',
                        picked && 'outline-2 outline-offset-2 outline-violet',
                      )}
                    >
                      <Link
                        href={routes.publicTask(pin.slug)}
                        onFocus={(event) => focusRow(event, pin.id)}
                        onBlur={letGo}
                        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl py-2.5 pl-3 outline-offset-2"
                      >
                        <span aria-hidden="true" className="relative grid size-9 shrink-0 place-items-center rounded-full transition-transform duration-300 ease-[var(--ease-out)] group-hover/row:scale-105" style={{ background: `color-mix(in oklab, var(--cat-${pin.categorySlug}) 16%, transparent)`, color: `var(--cat-${pin.categorySlug})` }}>
                          <Icon className="size-4" />
                          {picked && !reduced && <span className="absolute inset-0 rounded-full opacity-40 [animation:pulse-ring_1.6s_var(--ease-out)_3]" style={{ background: `var(--cat-${pin.categorySlug})` }} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{pin.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {categories(pin.categorySlug)} · {pin.areaName} · {formatDate(pin.windowStart)}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span className="text-sm font-semibold tabular-nums">{pinPrice(pin, (rate) => t('perHour', { rate }))}</span>
                          <AnimatePresence initial={false}>
                            {miles !== undefined && (
                              <m.span key="miles" initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs tabular-nums text-muted-foreground">
                                {t('milesAway', { miles })}
                              </m.span>
                            )}
                          </AnimatePresence>
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => showOnMap(pin.id)}
                        onFocus={(event) => focusRow(event, pin.id)}
                        onBlur={letGo}
                        aria-label={t('showTaskOnMap', { title: pin.title })}
                        className="ml-1 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-[background-color,color,scale] duration-200 hover:bg-foreground/[0.06] hover:text-foreground active:scale-95"
                      >
                        <LocateFixed aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                  </Leaving>
                </m.li>
              );
            })}
          </AnimatePresence>
        </m.ol>
      )}
    </AnimatePresence>
  );

  return (
    <LazyMotion features={domMax}>
      <div ref={rootRef} className={cn(fill && 'flex h-full flex-col', className)}>
        {fill ? content : <EasedHeight reduced={reduced}>{content}</EasedHeight>}
      </div>
    </LazyMotion>
  );
}

/** A row that's on its way out: still visible while it fades, but out of reach (no clicks, focus or reading). */
function Leaving({ children }: { children: React.ReactNode }) {
  const present = useIsPresent();
  return <div inert={!present} aria-hidden={present ? undefined : true}>{children}</div>;
}

/**
 * Eases its height to its content's (phones: the list is in the page's flow, so what follows it glides instead of
 * jumping when rows come and go). It paints a little past its edges so focus rings and shadows aren't cut.
 */
function EasedHeight({ reduced, children }: { reduced: boolean; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = inner.current;
    if (!element || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // The first measurement replaces `auto` (nothing to ease from); each one after eases from the last.
  return (
    <div
      style={height === null ? undefined : { height }}
      className={cn('overflow-clip [overflow-clip-margin:12px]', !reduced && 'transition-[height] duration-[420ms] ease-[var(--ease-out)]')}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
