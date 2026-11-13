'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AnimatePresence, LazyMotion, domMax, m, useIsPresent } from 'motion/react';
import { useTranslations } from 'next-intl';
import { LocateFixed } from 'lucide-react';
import { routes, type LandingMapData } from '@/contracts';
import { formatDate } from '@/shared/format';
import { spring, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from '../category-icons';
import { useLanding } from '../landing-state';
import { MAP_FRAME_ATTRIBUTE, useOptionalMapExplorer } from './explorer-state';
import { effectiveSort, nearbyPins } from './map-math';
import { pinPrice } from './pin-card';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The tasks beside the map, and the accessible version of it: real links, in order. Hovering or focusing
 * one lifts its pin on the map (and the map's hover lights it here); each row's pin button shows that task on
 * the map and opens its card. It follows the explorer: the picked category, the chosen distance, what's on
 * the map (when the list follows it), and the order (newest, nearest once the visitor shares a location, or
 * lowest price). When any of that changes, rows glide to their new places, leaving rows fade out and new ones
 * rise in, one after another.
 */
export function NearbyList({ map, limit = 7, className }: { map: LandingMapData; limit?: number; className?: string }) {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory, litTaskId, focusedTaskId, setHighlightedTaskId, pickTask, location } = useLanding();
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
  const listLabel = sort === 'nearest' ? t('listNearYou') : sort === 'price' ? t('listByPrice') : t('listNewest');

  const showOnMap = (id: string) => {
    pickTask(id);
    explorer?.requestFocus({ kind: 'task', id });
    const frame = document.querySelector(`[${MAP_FRAME_ATTRIBUTE}]`);
    const box = frame?.getBoundingClientRect();
    if (frame && box && (box.bottom < 80 || box.top > window.innerHeight * 0.6)) {
      frame.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }
  };

  return (
    <LazyMotion features={domMax}>
      <AnimatePresence mode="wait" initial={false}>
        {rows.length === 0 ? (
          <m.div
            key={`empty-${selectedCategory ?? 'all'}-${narrowed ? 'narrowed' : 'none'}`}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, transition: { duration: 0.16 } }}
            transition={{ duration: 0.32, ease: EASE }}
            className={cn('glass rounded-3xl p-6 text-center', className)}
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
          <m.ol key="list" layout={!reduced} transition={glide} className={cn('relative space-y-2', className)} aria-label={listLabel}>
            <AnimatePresence initial={false} mode="popLayout">
              {rows.map(({ pin, miles }, index) => {
                const lit = pin.id === litTaskId;
                const picked = pin.id === focusedTaskId;
                const Icon = CATEGORY_ICONS[pin.categorySlug];
                return (
                  <m.li
                    key={pin.id}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1, transition: { ...glide, delay: reduced ? 0 : index * 0.035 } }}
                    exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.97, transition: { duration: 0.18, ease: EASE } }}
                    transition={glide}
                  >
                    <Leaving>
                      <div data-reveal="" style={{ ['--reveal-delay' as string]: `${index * 50}ms` }}>
                        <div
                          onPointerEnter={() => setHighlightedTaskId(pin.id)}
                          onPointerLeave={() => setHighlightedTaskId(null)}
                          className={cn(
                            'group/row relative flex items-center rounded-2xl border border-transparent pr-1 transition-[background-color,border-color,transform,box-shadow] duration-300',
                            lit ? 'glass -translate-y-0.5' : 'hover:bg-card/70',
                            picked && 'outline-2 outline-offset-2 outline-violet',
                          )}
                        >
                          <Link
                            href={routes.publicTask(pin.slug)}
                            onFocus={() => setHighlightedTaskId(pin.id)}
                            onBlur={() => setHighlightedTaskId(null)}
                            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl py-2.5 pl-3 outline-offset-2"
                          >
                            <span aria-hidden="true" className="relative grid size-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in oklab, var(--cat-${pin.categorySlug}) 16%, transparent)`, color: `var(--cat-${pin.categorySlug})` }}>
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
                            onFocus={() => setHighlightedTaskId(pin.id)}
                            onBlur={() => setHighlightedTaskId(null)}
                            aria-label={t('showTaskOnMap', { title: pin.title })}
                            className="ml-1 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                          >
                            <LocateFixed aria-hidden="true" className="size-4" />
                          </button>
                        </div>
                      </div>
                    </Leaving>
                  </m.li>
                );
              })}
            </AnimatePresence>
          </m.ol>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}

/** A row that's on its way out: still visible while it fades, but out of reach (no clicks, focus or reading). */
function Leaving({ children }: { children: React.ReactNode }) {
  const present = useIsPresent();
  return <div inert={!present} aria-hidden={present ? undefined : true}>{children}</div>;
}
