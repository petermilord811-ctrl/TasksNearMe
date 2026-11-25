'use client';

import { CATEGORY_SLUGS, type CategorySlug } from '@/contracts';
import { CATEGORY_ICONS } from '@/ui/landing/category-icons';
import { donutArcs } from '@/ui/landing/map/map-math';
import { CHIP_ZOOM } from '@/ui/landing/map/pin-markers';
import { cn } from '@/ui/lib/utils';

/**
 * The app's map pins, in the landing map's look (owner, 2026-11-25: "you are still showing old free map in find work
 * map. You have customized well landing-page map. based on this, customize and use for your own features and rules").
 * Close in, a task is its price chip with its category's icon; farther out, a dot in its category's color. Lit (pointed
 * at, or its row in the list) it lifts and fills with its category's color. Unlike the landing's pins, which are
 * decorative (its list is the way in), these are the map's buttons: each named, in the Tab order, and opening the task's
 * card (accessibility pass, J-A10).
 */

/** At this zoom and closer, pins are price chips (the landing's). */
export const PIN_CHIP_ZOOM = CHIP_ZOOM;

const shades = (slug: CategorySlug) => {
  const color = `var(--cat-${slug})`;
  // Lit, the chip fills with a deeper shade of its color, so its white price reads (4.5:1).
  return { color, strong: `color-mix(in oklab, ${color} 68%, black)` };
};

export function MapPin({
  placeId,
  name,
  label,
  categorySlug,
  chip,
  lit,
  picked,
  fresh = false,
  onEnter,
  onLeave,
  onPick,
}: {
  placeId: string;
  /** Its accessible name: "Assemble a desk, $60, Mueller". */
  name: string;
  /** The chip's words: "$60" or "$30/h" (or a place's name on a one-place map). */
  label: string;
  categorySlug?: CategorySlug;
  /** Close in (a chip), or far out (a dot), unless it's lit. */
  chip: boolean;
  lit: boolean;
  picked: boolean;
  /** Posted in the last day: a soft halo breathes behind it (not with reduced motion). */
  fresh?: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onPick: () => void;
}) {
  const on = lit || picked;
  const near = chip || on || !categorySlug;
  const Icon = categorySlug ? CATEGORY_ICONS[categorySlug] : null;
  const look = categorySlug ? shades(categorySlug) : null;
  return (
    <button
      type="button"
      aria-label={name}
      // The live map hands keyboard focus over by this when it rebuilds its pins or replaces the drawn map.
      data-place-id={placeId}
      data-active={on}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={(event) => {
        event.stopPropagation();
        onPick();
      }}
      className={cn('relative grid min-h-8 min-w-8 place-items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', on && 'z-10')}
    >
      {fresh && look && !on && (
        <span aria-hidden="true" className="pointer-events-none absolute size-3.5 rounded-full opacity-0 motion-safe:animate-[live-ping_2.8s_var(--ease-out)_infinite]" style={{ background: look.color }} />
      )}
      {look && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute size-3.5 rounded-full border-[2.5px] border-white shadow-[0_2px_8px_-2px_rgb(0_0_0/0.45)] transition-[opacity,transform] duration-300 ease-[var(--ease-out)] dark:border-white/90',
            near ? 'scale-50 opacity-0' : 'scale-100',
          )}
          style={{ background: look.color }}
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-8 items-center gap-1.5 rounded-full border py-1 text-[13px] font-semibold whitespace-nowrap tabular-nums shadow-[0_6px_16px_-8px_rgb(0_0_0/0.5)] transition-[opacity,transform,background-color,color,border-color,box-shadow] duration-300 ease-[var(--ease-out)]',
          Icon ? 'pr-2.5 pl-1' : 'px-2.5',
          near ? 'opacity-100' : 'scale-75 opacity-0',
          on
            ? cn('-translate-y-1 scale-[1.08] border-transparent text-white shadow-[0_14px_28px_-12px_rgb(0_0_0/0.6)]', !look && 'bg-primary text-primary-foreground')
            : 'bg-card text-foreground hover:-translate-y-0.5',
          !look && !on && 'border-border',
          picked && 'ring-2 ring-white/90',
        )}
        style={look ? (on ? { background: look.strong } : { borderColor: `color-mix(in oklab, ${look.color} 45%, transparent)` }) : undefined}
      >
        {Icon && look && (
          <span
            className={cn('grid size-6 place-items-center rounded-full transition-colors duration-300', on && 'bg-white/25 text-white')}
            style={on ? undefined : { background: `color-mix(in oklab, ${look.color} 16%, transparent)`, color: look.color }}
          >
            <Icon className="size-3.5" />
          </span>
        )}
        {label}
      </span>
      {on && near && look && <span aria-hidden="true" className="absolute top-[calc(50%+14px)] size-2 rotate-45 rounded-[2px]" style={{ background: look.strong }} />}
    </button>
  );
}

/**
 * Several tasks close together: a donut of their categories (each arc in its category's color) with the count in the
 * middle, as on the landing's map. A click (or Enter) zooms in until they come apart.
 */
export function MapCluster({
  placeIds,
  categories,
  name,
  lit,
  onEnter,
  onLeave,
  onExpand,
}: {
  placeIds: string[];
  /** Each place's category, when it has one. */
  categories: (CategorySlug | undefined)[];
  name: string;
  lit: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onExpand: () => void;
}) {
  const total = placeIds.length;
  const counts = CATEGORY_SLUGS.map((slug) => categories.filter((category) => category === slug).length);
  const plain = total - counts.reduce((sum, count) => sum + count, 0);
  const size = total >= 25 ? 52 : total >= 10 ? 48 : 42;
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const arcs = plain === total ? [] : donutArcs(counts);
  return (
    <button
      type="button"
      aria-label={name}
      data-place-id={placeIds[0]}
      data-place-ids={placeIds.join(' ')}
      data-active={lit}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={(event) => {
        event.stopPropagation();
        onExpand();
      }}
      className={cn(
        'relative grid cursor-pointer place-items-center rounded-full bg-card shadow-[0_10px_26px_-12px_rgb(0_0_0/0.55)] outline-none transition-transform duration-300 ease-[var(--ease-out)] hover:scale-[1.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95',
        lit && 'z-10 scale-110 ring-2 ring-primary/60',
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 size-full -rotate-90" aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className={plain === total ? 'text-primary/50' : 'text-foreground/[0.06]'} />
        {arcs.map((arc) => {
          const slug = CATEGORY_SLUGS[arc.index]!;
          return (
            <circle
              key={slug}
              cx="24"
              cy="24"
              r={radius}
              fill="none"
              stroke={`var(--cat-${slug})`}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0.01, arc.length * circumference - 2)} ${circumference}`}
              strokeDashoffset={-(arc.start * circumference + 1)}
            />
          );
        })}
      </svg>
      <span aria-hidden="true" className="relative font-display text-[15px] leading-none font-semibold tabular-nums">{total}</span>
    </button>
  );
}
