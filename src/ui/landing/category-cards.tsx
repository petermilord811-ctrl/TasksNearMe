'use client';

import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ViewTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Globe, ShieldCheck } from 'lucide-react';
import { routes, type CategorySlug, type CategoryView } from '@/contracts';
import { formatMoneyShort } from '@/shared/format';
import { ServicePhoto } from '@/ui/components/media/service-photo';
import { HoverLift, Reveal } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from './category-icons';
import { useOptionalLanding } from './landing-state';

/**
 * What people book: one card per category with a real photo of the work (src/shared/service-photos.ts), its real
 * price guidance and how many of its tasks are open on the map right now. Each card answers the pointer like a card
 * on a table (it rises, tilts a little, and a light in the category's color follows the cursor, with the icon and
 * the arrow moving along); pointing at one tints the page (the map's pins and the town's quiet down to it). Opening
 * one carries its icon into the category page's header (a shared View Transition).
 */
export function CategoryCards({ categories, openCounts }: { categories: CategoryView[]; openCounts?: Partial<Record<CategorySlug, number>> }) {
  const t = useTranslations('landing.categories');
  const categoryName = useTranslations('helperCard.categories');
  const landing = useOptionalLanding();
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
      {categories.map((category, index) => {
        const Icon = CATEGORY_ICONS[category.slug];
        const wide = index < 2;
        // The last card of an odd number spans both columns on tablets.
        const spans = !wide && index === categories.length - 1 && categories.length % 2 === 1;
        const color = `var(--cat-${category.slug})`;
        const open = openCounts?.[category.slug] ?? 0;
        return (
          <li key={category.slug} className={cn(wide ? 'lg:col-span-3' : 'lg:col-span-2', spans && 'sm:col-span-2 lg:col-span-2')}>
            <Reveal index={index} className="h-full">
              <HoverLift className="h-full" surfaceClassName="lift-shadow rounded-3xl border border-foreground/[0.07] bg-card/75" glow={color} tilt={wide ? 3 : 4}>
                <Link
                  href={routes.category(category.slug)}
                  onPointerEnter={() => landing?.setPreviewCategory(category.slug)}
                  onPointerLeave={() => landing?.setPreviewCategory(null)}
                  onFocus={() => landing?.setPreviewCategory(category.slug)}
                  onBlur={() => landing?.setPreviewCategory(null)}
                  // Phones get a compact row per kind (audit L34: five 400 px tiles ran about 2,000 px): the photo
                  // square on the left, the name, the price and the open count beside it; the rest from 640 px.
                  className="flex h-full flex-col rounded-3xl p-2 outline-offset-4 max-sm:flex-row max-sm:items-center"
                >
                  {/* A real photo of the work (decorative: the card's name says the same). Wider cards show it at 16:9,
                      kept near the top so heads stay in. */}
                  <span className="block overflow-hidden rounded-[1.125rem] bg-muted max-sm:w-24 max-sm:shrink-0">
                    <ServicePhoto
                      category={category.slug}
                      crop="landscape"
                      decorative
                      sizes={wide ? '(min-width: 1024px) 35rem, (min-width: 640px) 50vw, 6rem' : spans ? '(min-width: 1024px) 23rem, (min-width: 640px) 100vw, 6rem' : '(min-width: 1024px) 23rem, (min-width: 640px) 50vw, 6rem'}
                      className={cn('object-[50%_30%] max-sm:aspect-square', wide && 'lg:aspect-video', spans && 'sm:aspect-video lg:aspect-4/3')}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col px-4 pt-4 pb-4 max-sm:py-1 max-sm:pr-2 sm:px-5 sm:pb-5">
                    {/* On phones this row goes last and shows only the open count (the photo names the kind). */}
                    <span className="flex items-start justify-between gap-3 max-sm:order-last max-sm:mt-1.5">
                      <ViewTransition name={`category-icon-${category.slug}`} share="category-morph" default="none">
                        <span className="lift-icon grid size-12 place-items-center rounded-2xl max-sm:hidden" style={{ background: `color-mix(in oklab, ${color} 15%, transparent)`, color }}>
                          <Icon aria-hidden="true" className="size-6" />
                        </span>
                      </ViewTransition>
                      {open > 0 && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-foreground/[0.045] px-2.5 py-1 text-xs font-medium text-foreground/80 tabular-nums">
                          <span aria-hidden="true" className="live-dot" style={{ background: color }} />
                          {t('openOnMap', { count: open })}
                        </span>
                      )}
                    </span>
                    <span className="block pt-4 max-sm:pt-0">
                      <span className="block font-display text-2xl font-semibold tracking-[-0.025em] max-sm:text-lg">{categoryName(category.slug)}</span>
                      <span className="mt-1 block text-sm text-muted-foreground max-sm:hidden">{t(`descriptions.${category.slug}`)}</span>
                      <span className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm max-sm:mt-1">
                        {/* Whole dollars read cleaner in a range (audit L34). */}
                        <span className="font-semibold tabular-nums">{t('range', { low: formatMoneyShort(category.priceGuidance.lowCents), high: formatMoneyShort(category.priceGuidance.highCents) })}</span>
                        <span className="text-muted-foreground">{t(`unit.${category.priceGuidance.unit}`)}</span>
                        {category.requiresBackgroundCheck && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground max-sm:hidden"><ShieldCheck aria-hidden="true" className="size-3.5" />{t('inHome')}</span>}
                        {category.remoteAllowed && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground max-sm:hidden"><Globe aria-hidden="true" className="size-3.5" />{t('remote')}</span>}
                      </span>
                    </span>
                    {/* The footer sits at the bottom, so the cards in a row line up when one has more to say. */}
                    <span className="mt-auto block pt-5 max-sm:hidden">
                      <span className="flex items-center justify-between gap-3 border-t border-foreground/[0.06] pt-4 text-sm font-semibold">
                        <span className="lift-fade">{t('explore', { category: categoryName(category.slug) })}</span>
                        <span aria-hidden="true" className="lift-arrow-x grid size-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${color} 13%, transparent)`, color }}>
                          <ArrowRight className="size-4" />
                        </span>
                      </span>
                    </span>
                  </span>
                </Link>
              </HoverLift>
            </Reveal>
          </li>
        );
      })}
    </ul>
  );
}
