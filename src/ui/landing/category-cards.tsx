'use client';

import Link from 'next/link';
import { ViewTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Globe, ShieldCheck } from 'lucide-react';
import { routes, type CategoryView } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { Reveal, Spotlight } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from './category-icons';
import { useOptionalLanding } from './landing-state';

/**
 * What people book: one card per category with its real price guidance; hovering one tints the page.
 * Opening one carries its icon into the category page's header (a shared View Transition).
 */
export function CategoryCards({ categories }: { categories: CategoryView[] }) {
  const t = useTranslations('landing.categories');
  const landing = useOptionalLanding();
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
      {categories.map((category, index) => {
        const Icon = CATEGORY_ICONS[category.slug];
        const wide = index < 2;
        return (
          <li key={category.slug} className={cn(wide ? 'lg:col-span-3' : 'lg:col-span-2')}>
            <Reveal index={index} className="h-full">
              <Spotlight glow={`var(--cat-${category.slug})`} className="h-full rounded-3xl">
                <Link
                  href={routes.category(category.slug)}
                  onPointerEnter={() => landing?.setPreviewCategory(category.slug)}
                  onPointerLeave={() => landing?.setPreviewCategory(null)}
                  onFocus={() => landing?.setPreviewCategory(category.slug)}
                  onBlur={() => landing?.setPreviewCategory(null)}
                  className="group/cat flex h-full min-h-52 flex-col rounded-3xl border border-foreground/[0.07] bg-card/70 p-6 shadow-card transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-foreground/15 hover:shadow-overlay"
                >
                  <span className="flex items-start justify-between">
                    <ViewTransition name={`category-icon-${category.slug}`} share="category-morph" default="none">
                      <span className="grid size-12 place-items-center rounded-2xl transition-transform duration-500 group-hover/cat:scale-110 group-hover/cat:-rotate-6" style={{ background: `color-mix(in oklab, var(--cat-${category.slug}) 15%, transparent)`, color: `var(--cat-${category.slug})` }}>
                        <Icon aria-hidden="true" className="size-6" />
                      </span>
                    </ViewTransition>
                    <ArrowUpRight aria-hidden="true" className="size-5 text-muted-foreground transition-transform duration-300 group-hover/cat:translate-x-0.5 group-hover/cat:-translate-y-0.5 group-hover/cat:text-foreground" />
                  </span>
                  <span className="mt-auto pt-8">
                    <span className="block font-display text-2xl font-semibold tracking-[-0.025em]">{category.name}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{t(`descriptions.${category.slug}`)}</span>
                    <span className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                      <span className="font-semibold tabular-nums">{t('range', { low: formatMoney(category.priceGuidance.lowCents), high: formatMoney(category.priceGuidance.highCents) })}</span>
                      <span className="text-muted-foreground">{t(`unit.${category.priceGuidance.unit}`)}</span>
                      {category.requiresBackgroundCheck && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-3.5" />{t('inHome')}</span>}
                      {category.remoteAllowed && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Globe aria-hidden="true" className="size-3.5" />{t('remote')}</span>}
                    </span>
                  </span>
                </Link>
              </Spotlight>
            </Reveal>
          </li>
        );
      })}
    </ul>
  );
}
