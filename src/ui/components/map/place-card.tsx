'use client';

import Link from 'next/link';
import { ArrowRight, X } from 'lucide-react';
import type { CategorySlug } from '@/contracts';
import { CATEGORY_ICONS } from '@/ui/landing/category-icons';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

/** What a picked pin's card says: the task's title, its general area, when, its price and what it earns. */
export interface MapPlaceCardContent {
  title: string;
  /** The general area's name, never an address. */
  area: string;
  when?: string;
  /** The price as the pin shows it ("$60", "$30/h"). */
  price: string;
  /** A line under the price: "You'd earn $54". */
  detail?: string;
  /** Where the task opens, as its row in the list opens it. */
  href: string;
}

/**
 * A picked pin's card, docked in the map (across its top on a phone, at its bottom left on a wide screen): the
 * task in a glance, a way to open it, and a way to close it. Docked rather than following the pin, so nothing is
 * measured or moved while the map moves, and it never covers the pin it belongs to near the map's edge.
 */
export function MapPlaceCard({ card, categorySlug, openLabel, closeLabel, onClose }: {
  card: MapPlaceCardContent;
  categorySlug?: CategorySlug;
  openLabel: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const Icon = categorySlug ? CATEGORY_ICONS[categorySlug] : null;
  const color = categorySlug ? `var(--cat-${categorySlug})` : 'var(--primary)';
  return (
    // At the top on a phone (the tab dock covers the bottom of a tall map there), bottom left on a wide screen.
    <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-20 flex justify-start sm:inset-x-3 sm:top-auto sm:bottom-6">
      <div
        aria-live="polite"
        className="pointer-events-auto relative w-full animate-in rounded-[1.25rem] border border-foreground/[0.08] bg-card p-3 pr-12 shadow-[0_18px_40px_-18px_rgb(23_18_14/0.55)] duration-200 fade-in-0 slide-in-from-top-2 sm:max-w-[22rem] sm:slide-in-from-bottom-2 dark:border-white/[0.08]"
      >
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
              <Icon className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 leading-snug font-semibold">{card.title}</p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{card.when ? `${card.area} · ${card.when}` : card.area}</p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
              <span className="font-semibold text-foreground">{card.price}</span>
              {card.detail && <span className="text-muted-foreground">{card.detail}</span>}
            </p>
          </div>
        </div>
        <Link href={card.href} className={cn(buttonVariants({ size: 'sm' }), 'mt-3 min-h-10 w-full rounded-full sm:w-auto')}>
          {openLabel}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="absolute top-1.5 right-1.5 inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
