'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarDays, MapPin } from 'lucide-react';
import { routes, type TaskMapPin } from '@/contracts';
import { formatDate, formatMoney } from '@/shared/format';
import { cn } from '@/ui/lib/utils';

export function pinPrice(pin: TaskMapPin, perHour: (rate: string) => string): string {
  return pin.budget.type === 'fixed' ? formatMoney(pin.budget.priceCents) : perHour(formatMoney(pin.budget.rateCents));
}

/**
 * The small glass card that grows out of a pin (positioned by the map view, in px from the map's top-left).
 * It names the task, its category, the area, the price and the day, and links to the public task page. It
 * opens above the pin, or below it when the pin is near the map's top edge (`placement`).
 */
export function PinCard({ pin, x, y, miles, onClose, placement = 'above' }: { pin: TaskMapPin; x: number | string; y: number | string; miles?: number; onClose?: () => void; placement?: 'above' | 'below' }) {
  const below = placement === 'below';
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  return (
    <div
      key={pin.id}
      className={cn('bloom-in pointer-events-auto absolute z-10 w-60 -translate-x-1/2', below ? 'translate-y-[18px]' : '-translate-y-[calc(100%+18px)]')}
      style={{ left: x, top: y, ['--bloom-origin' as string]: below ? '50% 0%' : '50% 100%' }}
      onPointerLeave={onClose}
    >
      {/* The list beside the map is the keyboard path to these tasks; the card is for pointer and touch. */}
      <Link
        href={routes.publicTask(pin.slug)}
        tabIndex={-1}
        className="glass group/pin block rounded-2xl p-3.5 text-left text-foreground no-underline outline-offset-4 transition-transform duration-200 hover:-translate-y-0.5"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: `var(--cat-${pin.categorySlug})` }} />
          {categories(pin.categorySlug)}
        </span>
        <span className="mt-1.5 block font-display text-[15px]/5 font-semibold tracking-[-0.01em] group-hover/pin:underline">{pin.title}</span>
        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-3.5" />{miles !== undefined ? t('areaAway', { area: pin.areaName, miles }) : pin.areaName}</span>
          <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="size-3.5" />{formatDate(pin.windowStart)}</span>
        </span>
        <span className="mt-2.5 flex items-center justify-between">
          <span className="text-sm font-semibold tabular-nums">{pinPrice(pin, (rate) => t('perHour', { rate }))}</span>
          <span className={cn('text-xs font-medium text-primary')}>{t('viewTask')}</span>
        </span>
      </Link>
      <span aria-hidden="true" className={cn('glass absolute left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-[3px]', below ? '-top-1.5 border-r-0 border-b-0' : '-bottom-1.5 border-t-0 border-l-0')} />
    </div>
  );
}
