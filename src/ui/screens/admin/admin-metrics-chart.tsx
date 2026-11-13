'use client';

import { useId, useState, type PointerEvent } from 'react';
import type { ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

export interface MetricsColumnChartProps {
  title: string;
  /** The period's total, already formatted ("452", "$375.00"). */
  total: string;
  /** One per market day, oldest first. */
  points: { startsAt: ISODateTime; value: number; label: string }[];
  /** The chart as one sentence, for screen readers (the daily table has every value). */
  summary: string;
}

/** Rounds a maximum up to a clean axis top: 1, 2, 2.5, 5 or 10 × a power of ten. */
function niceTop(max: number): number {
  if (max <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= max) ?? 10;
  return step * power;
}

/**
 * One series by day: thin columns from a single baseline, rounded at the data end, with a readout of the day
 * under the pointer (or the newest day). Decorative for screen readers beyond its summary: the daily table
 * carries every value.
 */
export function MetricsColumnChart({ title, total, points, summary }: MetricsColumnChartProps) {
  const { formatDate } = useFormat();
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const top = niceTop(Math.max(0, ...points.map((point) => point.value)));
  const shown = points[active ?? points.length - 1];
  const dense = points.length > 31;

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.floor(((event.clientX - box.left) / Math.max(1, box.width)) * points.length);
    setActive(Math.min(points.length - 1, Math.max(0, index)));
  };

  return <figure aria-labelledby={`${id}-title`} className="min-w-0 space-y-3">
    <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span id={`${id}-title`} className="font-medium">{title}</span>
      <span className="font-semibold tabular-nums">{total}</span>
    </figcaption>
    <p className="sr-only">{summary}</p>
    <div aria-hidden="true" className="space-y-1.5">
      <div className="flex min-h-5 items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{shown ? formatDate(shown.startsAt) : ''}</span>
        <span className="font-semibold tabular-nums">{shown?.label}</span>
      </div>
      <div className="relative">
        <span className="absolute -top-0.5 right-0 text-xs leading-4 text-muted-foreground tabular-nums">{top.toLocaleString('en-US')}</span>
        <div
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          className={cn('flex h-28 touch-pan-y items-end border-b border-foreground/[0.12] pt-5 dark:border-white/[0.14]', dense ? 'gap-px' : 'gap-0.5')}
        >
          {points.map((point, index) => <div key={point.startsAt} className="flex h-full min-w-0 flex-1 items-end justify-center">
            <div
              className={cn(
                'w-full max-w-6 rounded-t-[4px] transition-colors duration-150',
                point.value > 0 ? 'bg-primary/75' : 'bg-transparent',
                (active ?? points.length - 1) === index && point.value > 0 && 'bg-primary',
              )}
              style={{ height: point.value > 0 ? `max(2px, ${(100 * point.value) / top}%)` : 0 }}
            />
          </div>)}
        </div>
      </div>
      <div className="flex justify-between gap-2 text-xs leading-4 text-muted-foreground">
        <span>{points[0] ? formatDate(points[0].startsAt) : ''}</span>
        <span>{points.at(-1) ? formatDate(points.at(-1)!.startsAt) : ''}</span>
      </div>
    </div>
  </figure>;
}
