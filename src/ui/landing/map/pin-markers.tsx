'use client';

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
  onEnter: () => void;
  onLeave: () => void;
  onPick: () => void;
}) {
  const Icon = CATEGORY_ICONS[pin.categorySlug];
  const color = `var(--cat-${pin.categorySlug})`;
  // Lit, the chip fills with a deeper shade of its color, so its white price reads (4.5:1).
  const strong = `color-mix(in oklab, ${color} 68%, black)`;
  const on = lit || picked;
  const near = chip || on;
  return (
    <div
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
export function ClusterMarker({ counts, total, label, activeCategory, hidden, onExpand }: { counts: number[]; total: number; label?: string; activeCategory: string | null; hidden: boolean; onExpand: () => void }) {
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
