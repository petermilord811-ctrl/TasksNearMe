'use client';

import Link from 'next/link';
import { useId } from 'react';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { LocateFixed, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { CATEGORY_SLUGS, routes, type CategorySlug, type HomePageData } from '@/contracts';
import { Reveal, spring, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from './ask-pill';
import { MAP_SECTION_ID, useLanding } from './landing-state';
import { insideServiceArea } from './map/map-math';
import { NearbyList } from './map/nearby-list';
import { TaskMap, type MapMode } from './map/task-map';

/**
 * Tasks near you: a mid-size map that melts into the page, the list beside it, the category filter, and
 * "Use my location" (asked only on press; the location stays on this device). One click moves everything
 * together: the filter's pill slides to the pick, the count rolls to the new number, the list glides into its
 * new order, the map flies to those tasks, and the hero tints to the category.
 */
export function MapSection({ data, mapMode }: { data: HomePageData; mapMode: MapMode }) {
  const t = useTranslations('landing.map');
  const { location, requestLocation } = useLanding();
  const reduced = usePrefersReducedMotion();
  const market = data.market.name;
  const outside = location.status === 'granted' && !insideServiceArea(data.map, location.point);

  return (
    <LazyMotion features={domMax}>
      <section id={MAP_SECTION_ID} aria-labelledby="map-title" className="relative scroll-mt-24 overflow-x-clip py-16 sm:py-24">
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
            <CategoryFilter />
          </Reveal>
          <OpenCount data={data} />

          <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
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
    </LazyMotion>
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
    <div role="group" aria-label={t('filterLabel')} className="flex w-max gap-2">
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
              'relative isolate inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-[border-color,color,transform] duration-300 active:scale-[0.96]',
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

/** How many open tasks the pick shows, rolling to the new number; announced politely. */
function OpenCount({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory } = useLanding();
  const reduced = usePrefersReducedMotion();
  const count = selectedCategory ? data.map.pins.filter((pin) => pin.categorySlug === selectedCategory).length : data.map.pins.length;
  const text = selectedCategory ? t('countCategory', { category: categories(selectedCategory), count }) : t('countAll', { count, market: data.market.name });

  return (
    <p role="status" aria-live="polite" className="relative mt-3 h-6 overflow-hidden text-sm font-medium text-muted-foreground">
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
  );
}
