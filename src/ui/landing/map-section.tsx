'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LocateFixed, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { CATEGORY_SLUGS, routes, type HomePageData } from '@/contracts';
import { Reveal } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from './ask-pill';
import { useLanding } from './landing-state';
import { insideServiceArea } from './map/map-math';
import { NearbyList } from './map/nearby-list';
import { TaskMap, type MapMode } from './map/task-map';

/**
 * Tasks near you: a mid-size map that melts into the page, the list beside it, the category filter, and
 * "Use my location" (asked only on press; the location stays on this device). The map and the list share
 * one state, so hovering one lights up the other.
 */
export function MapSection({ data, mapMode }: { data: HomePageData; mapMode: MapMode }) {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { activeCategory, setActiveCategory, location, requestLocation } = useLanding();
  const market = data.market.name;
  const outside = location.status === 'granted' && !insideServiceArea(data.map, location.point);

  return (
    <section id="tasks-near-you" aria-labelledby="map-title" className="relative scroll-mt-24 overflow-x-clip py-16 sm:py-24">
      <div className="mx-auto max-w-content px-gutter">
        <Reveal className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{t('eyebrow')}</p>
            <h2 id="map-title" className="mt-3 font-display text-4xl leading-[1.02] font-semibold tracking-[-0.035em] sm:text-5xl">
              {t('title')} <span className="font-accent font-normal tracking-[-0.01em] text-violet italic">{t('titleAccent')}</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">{t('body', { market })}</p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <button
              type="button"
              onClick={requestLocation}
              disabled={location.status === 'locating'}
              className={cn(
                'inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-[transform,background-color,box-shadow] duration-300 active:scale-[0.97] disabled:opacity-70',
                location.status === 'granted' ? 'glass text-foreground' : 'bg-foreground text-background hover:-translate-y-px hover:shadow-[0_12px_28px_-12px_rgb(0_0_0/0.45)]',
              )}
            >
              {location.status === 'locating' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <LocateFixed aria-hidden="true" className="size-4" />}
              {location.status === 'locating' ? t('locating') : location.status === 'granted' ? t('nearYou') : t('useLocation')}
            </button>
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-3.5" />{t('privacy')}</p>
          </div>
        </Reveal>

        <div role="status" aria-live="polite" className="mt-4 min-h-6 text-sm">
          {location.status === 'denied' && <p className="text-muted-foreground">{t('denied', { market })}</p>}
          {location.status === 'unavailable' && <p className="text-muted-foreground">{t('unavailable', { market })}</p>}
          {outside && (
            <p className="text-foreground">
              {t('outside')}{' '}
              <Link href={routes.waitlist()} className="font-semibold text-primary underline-offset-4 hover:underline">{t('waitlist')}</Link>
            </p>
          )}
        </div>

        <Reveal index={1} className="mt-2 -mx-gutter overflow-x-auto px-gutter pb-1 [scrollbar-width:none]">
          <div role="group" aria-label={t('filterLabel')} className="flex w-max gap-2">
            <button
              type="button"
              aria-pressed={activeCategory === null}
              onClick={() => setActiveCategory(null)}
              className={cn('inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors', activeCategory === null ? 'bg-foreground text-background' : 'bg-foreground/[0.05] text-foreground hover:bg-foreground/[0.09]')}
            >
              {t('all')}
            </button>
            {CATEGORY_SLUGS.map((category) => {
              const Icon = CATEGORY_ICONS[category];
              const on = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setActiveCategory(on ? null : category)}
                  className={cn('inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-[background-color,border-color,color] duration-200', on ? 'border-transparent text-white' : 'border-foreground/10 bg-card/60 hover:border-foreground/25')}
                  style={on ? { background: `var(--cat-${category})` } : undefined}
                >
                  <Icon aria-hidden="true" className="size-4" style={on ? undefined : { color: `var(--cat-${category})` }} />
                  {categories(category)}
                </button>
              );
            })}
          </div>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
          <Reveal variant="bloom" origin="50% 50%">
            <figure className="m-0">
              <p className="sr-only">{t('mapLabel', { market })}</p>
              <TaskMap map={data.map} mode={mapMode} />
              <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden="true" className="size-3.5" />{t('caption')}</span>
                <span>{data.map.attribution}</span>
              </figcaption>
            </figure>
          </Reveal>
          <div>
            <NearbyList map={data.map} />
            {data.map.pins.length > 0 && (
              <Reveal className="mt-4 px-3.5">
                <Link href={routes.taskBoard(data.market.slug)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('browseAll')}</Link>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
