'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, CalendarDays, MapPin, MessageSquareText, X } from 'lucide-react';
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
 * picked task's card stays open with a close button; a pointed-at one closes as the pointer leaves.
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
      className={cn('bloom-in pointer-events-auto absolute z-10 w-64 -translate-x-1/2', below ? 'translate-y-[26px]' : '-translate-y-[calc(100%+26px)]')}
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
  const { formatDate } = useFormat();
  const below = placement === 'below';
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const Icon = CATEGORY_ICONS[pin.categorySlug];
  const color = `var(--cat-${pin.categorySlug})`;
  return (
    <>
      <div className="group/pin relative rounded-2xl border border-foreground/[0.08] bg-card p-3.5 text-left text-foreground shadow-overlay">
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
        <Link
          href={routes.publicTask(pin.slug)}
          tabIndex={-1}
          className="mt-2 block font-display text-[15px]/5 font-semibold tracking-[-0.01em] text-foreground no-underline outline-offset-4 after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover/pin:underline"
        >
          {pin.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-3.5" />{miles !== undefined ? t('areaAway', { area: pin.areaName, miles }) : pin.areaName}</span>
          <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="size-3.5" />{formatDate(pin.windowStart)}</span>
          <span className="inline-flex items-center gap-1"><MessageSquareText aria-hidden="true" className="size-3.5" />{t('offers', { count: pin.offerCount })}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-foreground/[0.07] pt-2.5">
          <span className="text-base font-semibold tabular-nums">{pinPrice(pin, (rate) => t('perHour', { rate }))}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            {t('viewTask')}
            <ArrowRight aria-hidden="true" className="size-3.5 transition-transform duration-200 group-hover/pin:translate-x-0.5" />
          </span>
        </div>
      </div>
      <span aria-hidden="true" className={cn('absolute left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-[3px] border border-foreground/[0.08] bg-card', below ? '-top-1.5 border-r-0 border-b-0' : '-bottom-1.5 border-t-0 border-l-0')} />
    </>
  );
}
