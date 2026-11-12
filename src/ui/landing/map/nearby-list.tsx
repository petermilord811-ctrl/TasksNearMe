'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
import { routes, type LandingMapData } from '@/contracts';
import { formatDate } from '@/shared/format';
import { cn } from '@/ui/lib/utils';
import { useLanding } from '../landing-state';
import { nearbyPins } from './map-math';
import { pinPrice } from './pin-card';

/**
 * The tasks beside the map, and the accessible version of it: real links, in order. Hovering or focusing
 * one lifts its pin on the map (and the map's hover highlights it here). Nearest first once the visitor
 * shares a location; the picked category only.
 */
export function NearbyList({ map, limit = 7, className }: { map: LandingMapData; limit?: number; className?: string }) {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { activeCategory, highlightedTaskId, setHighlightedTaskId, location } = useLanding();
  const from = location.status === 'granted' ? location.point : undefined;
  const rows = useMemo(() => nearbyPins(map.pins, { from, category: activeCategory, limit }), [map.pins, from, activeCategory, limit]);

  if (rows.length === 0) {
    return (
      <div className={cn('glass rounded-3xl p-6 text-center', className)}>
        <p className="font-display text-lg font-semibold">{activeCategory ? t('emptyCategoryTitle', { category: categories(activeCategory) }) : t('emptyTitle')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('emptyBody')}</p>
        <Link href={routes.app.newTask()} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform hover:bg-primary-hover active:scale-[0.97]">
          {t('postFirst')}
        </Link>
      </div>
    );
  }

  return (
    <ol className={cn('space-y-2', className)} aria-label={from ? t('listNearYou') : t('listNewest')}>
      {rows.map(({ pin, miles }, index) => {
        const lit = pin.id === highlightedTaskId;
        return (
          <li key={pin.id} data-reveal="" style={{ ['--reveal-delay' as string]: `${index * 50}ms` }}>
            <Link
              href={routes.publicTask(pin.slug)}
              onPointerEnter={() => setHighlightedTaskId(pin.id)}
              onPointerLeave={() => setHighlightedTaskId(null)}
              onFocus={() => setHighlightedTaskId(pin.id)}
              onBlur={() => setHighlightedTaskId(null)}
              className={cn(
                'group/row flex min-h-14 items-center gap-3 rounded-2xl border border-transparent px-3.5 py-2.5 transition-[background-color,border-color,transform] duration-200',
                lit ? 'glass -translate-y-0.5' : 'hover:bg-card/70',
              )}
            >
              <span aria-hidden="true" className="relative grid size-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in oklab, var(--cat-${pin.categorySlug}) 16%, transparent)` }}>
                <span className="size-2.5 rounded-full" style={{ background: `var(--cat-${pin.categorySlug})` }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{pin.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {categories(pin.categorySlug)} · {pin.areaName} · {formatDate(pin.windowStart)}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-sm font-semibold tabular-nums">{pinPrice(pin, (rate) => t('perHour', { rate }))}</span>
                {miles !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{t('milesAway', { miles })}</span>}
              </span>
              <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover/row:-translate-y-0.5 group-hover/row:translate-x-0.5" />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
