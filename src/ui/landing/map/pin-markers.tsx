'use client';

import { useLayoutEffect, useRef } from 'react';
import { CATEGORY_SLUGS, type TaskMapPin } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from '../category-icons';
import { donutArcs } from './map-math';

/** At this zoom and closer, tasks show as price chips; farther out, as small dots. */
export const CHIP_ZOOM = 10.4;

/**
 * One task on the live map: a price chip with its category's icon where there's room for it (close in, and
 * not over another chip), otherwise a small dot (they cross-fade). Lit (pointed at, or picked) it's always a
 * chip, lifts and fills with its category's color;
 * quiet (another category, or outside the chosen distance) it fades back. Decorative: the list beside the map
 * is the accessible way to the same tasks.
 */
export function PinMarker({
  pin,
  price,
  chip,
  lit,
  picked,
  quiet,
  hidden,
  appear,
  onEnter,
  onLeave,
  onPick,
}: {
  pin: TaskMapPin;
  price: string;
  /** There's room for the price chip here (otherwise a dot, unless it's lit). */
  chip: boolean;
  lit: boolean;
  picked: boolean;
  quiet: boolean;
  hidden: boolean;
  /** How it comes onto the map: `drop` (a task posted just now), `fade` (a filter brought it back), or simply there. */
  appear?: 'drop' | 'fade';
  onEnter: () => void;
  onLeave: () => void;
  onPick: () => void;
}) {
  const Icon = CATEGORY_ICONS[pin.categorySlug];
  const rootRef = useRef<HTMLDivElement>(null);
  const firstAppear = useRef(appear);
  // Played once, as it mounts (the map's own marker keeps its position on the outer element).
  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element || !firstAppear.current || typeof element.animate !== 'function') return;
    if (firstAppear.current === 'drop') {
      element.animate(
        [
          { transform: 'translateY(-34px) scale(0.6)', opacity: 0 },
          { transform: 'translateY(3px) scale(1.08)', opacity: 1, offset: 0.62 },
          { transform: 'translateY(0) scale(1)', opacity: 1 },
        ],
        { duration: 760, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    } else element.animate([{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }, []);
  const color = `var(--cat-${pin.categorySlug})`;
  // Lit, the chip fills with a deeper shade of its color, so its white price reads (4.5:1).
  const strong = `color-mix(in oklab, ${color} 68%, black)`;
  const on = lit || picked;
  const near = chip || on;
  return (
    <div
      ref={rootRef}
      className={cn(
        'relative grid place-items-center transition-[opacity,filter,transform] duration-300 ease-[var(--ease-out)]',
        quiet && !on && 'opacity-25 saturate-50',
        hidden && 'pointer-events-none scale-75 opacity-0',
      )}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onClick={(event) => {
        event.stopPropagation();
        onPick();
      }}
    >
      {/* Far out: a dot with a white ring. */}
      <span
        className={cn(
          'absolute size-3.5 cursor-pointer rounded-full border-[2.5px] border-white shadow-[0_2px_8px_-2px_rgb(0_0_0/0.45)] transition-[opacity,transform] duration-300 ease-[var(--ease-out)]',
          near ? 'pointer-events-none scale-50 opacity-0' : on ? 'scale-[1.45]' : 'scale-100',
        )}
        style={{ background: color }}
      />
      {/* Close in: the price, with the category's icon. */}
      <span
        className={cn(
          'relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-[13px] font-semibold whitespace-nowrap tabular-nums shadow-[0_6px_16px_-8px_rgb(0_0_0/0.5)] transition-[opacity,transform,background-color,color,border-color,box-shadow] duration-300 ease-[var(--ease-out)]',
          near ? 'opacity-100' : 'pointer-events-none scale-75 opacity-0',
          on ? '-translate-y-1 scale-[1.08] border-transparent text-white shadow-[0_14px_28px_-12px_rgb(0_0_0/0.6)]' : 'bg-card text-foreground',
          picked && 'ring-2 ring-white/90 ring-offset-0',
        )}
        style={on ? { background: strong } : { borderColor: `color-mix(in oklab, ${color} 45%, transparent)` }}
      >
        <span
          className={cn('grid size-6 place-items-center rounded-full transition-colors duration-300', on ? 'bg-white/25 text-white' : '')}
          style={on ? undefined : { background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
        >
          <Icon aria-hidden="true" className="size-3.5" />
        </span>
        {price}
      </span>
      {on && near && <span aria-hidden="true" className="absolute top-[calc(50%+14px)] size-2 rotate-45 rounded-[2px]" style={{ background: strong }} />}
    </div>
  );
}

/**
 * Several tasks close together: a donut of their categories (each arc in its category's color) with the count
 * in the middle, and the neighborhood's name beside it when they share one. A click zooms in until they come
 * apart. A picked category keeps its arc bright.
 */
export function ClusterMarker({
  counts,
  total,
  label,
  activeCategory,
  hidden,
  blooming = false,
  onExpand,
}: {
  counts: number[];
  total: number;
  label?: string;
  activeCategory: string | null;
  hidden: boolean;
  /** Its tasks are fanned out around it: it stays as their middle, a little quieter. */
  blooming?: boolean;
  onExpand: () => void;
}) {
  const size = label ? 40 : total >= 25 ? 58 : total >= 10 ? 52 : 46;
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const arcs = donutArcs(counts);
  const activeCount = activeCategory ? counts[CATEGORY_SLUGS.indexOf(activeCategory as (typeof CATEGORY_SLUGS)[number])] ?? 0 : null;
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={(event) => {
        event.stopPropagation();
        onExpand();
      }}
      className={cn(
        'inline-flex cursor-pointer items-center rounded-full bg-card shadow-[0_10px_26px_-12px_rgb(0_0_0/0.55)] transition-[opacity,transform] duration-300 ease-[var(--ease-out)] hover:scale-[1.05] active:scale-95',
        label && 'gap-1.5 py-1 pr-3 pl-1',
        activeCount === 0 && 'opacity-35',
        blooming && 'scale-90 ring-2 ring-violet/40',
        hidden && 'pointer-events-none scale-75 opacity-0',
      )}
    >
      <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
        <svg viewBox="0 0 48 48" className="absolute inset-0 size-full -rotate-90" aria-hidden="true" focusable="false">
          <circle cx="24" cy="24" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-foreground/[0.06]" />
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
                className="transition-opacity duration-300"
                opacity={activeCategory && activeCategory !== slug ? 0.22 : 1}
              />
            );
          })}
        </svg>
        <span className={cn('relative font-display leading-none font-semibold tabular-nums', label ? 'text-[13px]' : 'text-[15px]')}>{activeCount ?? total}</span>
      </span>
      {label && <span className="text-[13px] font-semibold whitespace-nowrap">{label}</span>}
    </button>
  );
}

/**
 * One task of a cluster in bloom: a round badge in its category's color with its icon, fanned out from the cluster
 * (`at`, pixels from its middle). Pointing at it lights its card, as a pin does; a click picks it. It springs out in
 * turn (`order`), unless motion is reduced. Decorative, like the pins: the list is the accessible way to the tasks.
 */
export function BloomBadge({
  pin,
  at,
  order,
  lit,
  reduced,
  onEnter,
  onLeave,
  onPick,
}: {
  pin: TaskMapPin;
  at: { x: number; y: number };
  order: number;
  lit: boolean;
  reduced: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onPick: () => void;
}) {
  const Icon = CATEGORY_ICONS[pin.categorySlug];
  const color = `var(--cat-${pin.categorySlug})`;
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || reduced || typeof element.animate !== 'function') return;
    element.animate(
      [
        { transform: 'translate(-50%, -50%) translate(0px, 0px) scale(0.3)', opacity: 0 },
        { transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px) scale(1)`, opacity: 1 },
      ],
      { duration: 420, delay: order * 22, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' },
    );
    // Only as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onClick={(event) => {
        event.stopPropagation();
        onPick();
      }}
      className={cn(
        'pointer-events-auto absolute top-0 left-0 grid size-[34px] cursor-pointer place-items-center rounded-full border-[2.5px] bg-card shadow-[0_8px_18px_-8px_rgb(0_0_0/0.55)] transition-[box-shadow,background-color,color] duration-200',
        lit && 'text-white',
      )}
      style={{ transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)`, borderColor: color, ...(lit ? { background: `color-mix(in oklab, ${color} 68%, black)` } : { color }) }}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
