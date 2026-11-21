'use client';

import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, CalendarDays, MapPin, X } from 'lucide-react';
import { routes, type TaskMapPin } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from '../category-icons';

export function pinPrice(pin: TaskMapPin, perHour: (rate: string) => string): string {
  return pin.budget.type === 'fixed' ? formatMoney(pin.budget.priceCents) : perHour(formatMoney(pin.budget.rateCents));
}

/**
 * The card that grows out of a pin (positioned by the map, in px or % from the map's top-left; solid, so nothing
 * behind it shows through): the category, the title, the area (and how far, once the visitor shared a location),
 * the day, how many offers it has, the price, and a link to the task. It opens above the pin, or below it near the map's top edge. A
 * picked task's card stays open with a close button and takes clicks; a pointed-at one is a preview that lets clicks
 * through to the pins under it (it never hides a pin from the pointer), and closes as the pointer leaves.
 *
 * It repeats a row of the list beside the map (the keyboard and screen-reader path to the same tasks), so
 * it's hidden from assistive tech and out of the tab order.
 */
export function PinCard({
  pin,
  x,
  y,
  miles,
  onClose,
  onPointerEnter,
  onPointerLeave,
  placement = 'above',
  picked = false,
}: {
  pin: TaskMapPin;
  x: number | string;
  y: number | string;
  miles?: number;
  onClose?: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  placement?: 'above' | 'below';
  picked?: boolean;
}) {
  const below = placement === 'below';
  return (
    <div
      key={pin.id}
      aria-hidden="true"
      className={cn('bloom-in absolute z-10 w-64 -translate-x-1/2', picked ? 'pointer-events-auto' : 'pointer-events-none', below ? 'translate-y-[26px]' : '-translate-y-[calc(100%+26px)]')}
      style={{ left: x, top: y, ['--bloom-origin' as string]: below ? '50% 0%' : '50% 100%' }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <PinCardBody pin={pin} miles={miles} onClose={onClose} placement={placement} picked={picked} />
    </div>
  );
}

/**
 * The card itself, without its placement: the live map positions it (and glides it from pin to pin), the drawn
 * map uses `PinCard`. Its little pointer sits on the side facing the pin.
 */
export function PinCardBody({
  pin,
  miles,
  onClose,
  placement = 'above',
  picked = false,
}: {
  pin: TaskMapPin;
  miles?: number;
  onClose?: () => void;
  placement?: 'above' | 'below';
  picked?: boolean;
}) {
  const { formatDate, formatTimeRange } = useFormat();
  const below = placement === 'below';
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const Icon = CATEGORY_ICONS[pin.categorySlug];
  const color = `var(--cat-${pin.categorySlug})`;
  // A whole day (or more) reads as such, not as "12:00 am–11:59 pm".
  const startDate = formatDate(pin.windowStart);
  const endDate = formatDate(pin.windowEnd);
  const wholeDay = Date.parse(pin.windowEnd) - Date.parse(pin.windowStart) >= 23.5 * 3_600_000;
  const whenText = wholeDay
    ? startDate === endDate
      ? t('cardAnyTime', { date: startDate })
      : t('cardDays', { from: startDate, to: endDate })
    : t('cardWhenValue', { date: startDate, time: formatTimeRange(pin.windowStart, pin.windowEnd) });
  return (
    <>
      <div className="group/pin relative rounded-2xl border border-foreground/[0.08] bg-card p-4 text-left text-foreground shadow-overlay">
        <div className="flex items-center gap-2 pr-7 text-xs font-medium text-muted-foreground">
          <span className="grid size-6 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
            <Icon aria-hidden="true" className="size-3.5" />
          </span>
          <span className="truncate">{categories(pin.categorySlug)}</span>
        </div>
        {picked && onClose && (
          <button
            type="button"
            tabIndex={-1}
            onClick={onClose}
            aria-label={t('closeCard')}
            className="absolute top-2 right-2 z-[1] grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
        {/* The whole card opens the task, in a new tab: the map stays as it was (owner, 2026-11-21). */}
        <Link
          href={routes.publicTask(pin.slug)}
          target="_blank"
          rel="noopener"
          tabIndex={-1}
          className="mt-2.5 line-clamp-2 font-display text-[17px]/[1.3] font-semibold tracking-[-0.015em] text-foreground no-underline outline-offset-4 after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover/pin:underline"
        >
          {pin.title}
        </Link>
        {/* Where (the neighborhood, never an address), when, and where it stands, one per line. */}
        <dl className="mt-3 grid gap-1.5 text-[13px] text-foreground/85">
          <div className="flex min-w-0 items-center gap-2">
            <dt className="sr-only">{t('cardWhere')}</dt>
            <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <dd className="min-w-0 truncate">{miles !== undefined ? t('areaAway', { area: pin.areaName, miles }) : pin.areaName}</dd>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <dt className="sr-only">{t('cardWhen')}</dt>
            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <dd className="min-w-0 truncate">{whenText}</dd>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <dt className="sr-only">{t('cardStatus')}</dt>
            <span aria-hidden="true" className="grid size-3.5 shrink-0 place-items-center"><span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.18)]" /></span>
            <dd className="min-w-0 truncate">{t('cardOpen', { count: pin.offerCount })}</dd>
          </div>
        </dl>
        <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-foreground/[0.07] pt-3">
          <span className="text-lg font-semibold tabular-nums">{pinPrice(pin, (rate) => t('perHour', { rate }))}</span>
          <span className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-[filter] group-hover/pin:brightness-110">
            {t('viewTask')}
            <ArrowUpRight aria-hidden="true" className="size-3.5 transition-transform duration-200 group-hover/pin:translate-x-0.5 group-hover/pin:-translate-y-0.5" />
          </span>
        </div>
      </div>
      <span aria-hidden="true" className={cn('absolute left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-[3px] border border-foreground/[0.08] bg-card', below ? '-top-1.5 border-r-0 border-b-0' : '-bottom-1.5 border-t-0 border-l-0')} />
    </>
  );
}
