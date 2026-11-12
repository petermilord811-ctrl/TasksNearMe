'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AnimatePresence, LazyMotion, domMax, m, useIsPresent } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
import { routes, type LandingMapData } from '@/contracts';
import { formatDate } from '@/shared/format';
import { spring, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { useLanding } from '../landing-state';
import { nearbyPins } from './map-math';
import { pinPrice } from './pin-card';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The tasks beside the map, and the accessible version of it: real links, in order. Hovering or focusing
 * one lifts its pin on the map (and the map's hover lights it here). Nearest first once the visitor shares
 * a location; the picked category only. When the pick or the order changes, rows glide to their new places,
 * leaving rows fade out and new ones rise in, one after another.
 */
export function NearbyList({ map, limit = 7, className }: { map: LandingMapData; limit?: number; className?: string }) {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory, litTaskId, focusedTaskId, setHighlightedTaskId, location } = useLanding();
  const reduced = usePrefersReducedMotion();
  const from = location.status === 'granted' ? location.point : undefined;
  const rows = useMemo(() => nearbyPins(map.pins, { from, category: selectedCategory, limit }), [map.pins, from, selectedCategory, limit]);
  const glide = reduced ? { duration: 0 } : spring.bloom;

  return (
    <LazyMotion features={domMax}>
      <AnimatePresence mode="wait" initial={false}>
        {rows.length === 0 ? (
          <m.div
            key={`empty-${selectedCategory ?? 'all'}`}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, transition: { duration: 0.16 } }}
            transition={{ duration: 0.32, ease: EASE }}
            className={cn('glass rounded-3xl p-6 text-center', className)}
          >
            <p className="font-display text-lg font-semibold">{selectedCategory ? t('emptyCategoryTitle', { category: categories(selectedCategory) }) : t('emptyTitle')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('emptyBody')}</p>
            <Link href={routes.app.newTask(selectedCategory ? { category: selectedCategory } : {})} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform hover:bg-primary-hover active:scale-[0.97]">
              {t('postFirst')}
            </Link>
          </m.div>
        ) : (
          <m.ol key="list" layout={!reduced} transition={glide} className={cn('relative space-y-2', className)} aria-label={from ? t('listNearYou') : t('listNewest')}>
            <AnimatePresence initial={false} mode="popLayout">
              {rows.map(({ pin, miles }, index) => {
                const lit = pin.id === litTaskId;
                const picked = pin.id === focusedTaskId;
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
                      <Link
                        href={routes.publicTask(pin.slug)}
                        onPointerEnter={() => setHighlightedTaskId(pin.id)}
                        onPointerLeave={() => setHighlightedTaskId(null)}
                        onFocus={() => setHighlightedTaskId(pin.id)}
                        onBlur={() => setHighlightedTaskId(null)}
                        className={cn(
                          'group/row relative flex min-h-14 items-center gap-3 rounded-2xl border border-transparent px-3.5 py-2.5 transition-[background-color,border-color,transform,box-shadow] duration-300',
                          lit ? 'glass -translate-y-0.5' : 'hover:bg-card/70',
                          picked && 'outline-2 outline-offset-2 outline-violet',
                        )}
                      >
                        <span aria-hidden="true" className="relative grid size-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in oklab, var(--cat-${pin.categorySlug}) 16%, transparent)` }}>
                          <span className="size-2.5 rounded-full" style={{ background: `var(--cat-${pin.categorySlug})` }} />
                          {picked && !reduced && <span className="absolute inset-0 rounded-full [animation:pulse-ring_1.6s_var(--ease-out)_3]" style={{ background: `var(--cat-${pin.categorySlug})` }} />}
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
                        <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover/row:-translate-y-0.5 group-hover/row:translate-x-0.5" />
                      </Link>
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
