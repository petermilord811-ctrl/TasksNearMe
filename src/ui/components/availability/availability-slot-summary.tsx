import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AvailabilitySlotView, PricingInput } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';

export function AvailabilityPrice({ pricing }: { pricing: PricingInput }) {
  const t = useTranslations('availability');
  return <span className="tabular-nums">{pricing.type === 'fixed'
    ? formatMoney(pricing.priceCents)
    : t('hourlyPrice', { rate: formatMoney(pricing.rateCents), estimated: formatHours(pricing.estimatedHours), cap: formatHours(pricing.hoursCap) })}</span>;
}

/** The supplied slot's terms, always displayed in the market's time zone. */
export function AvailabilitySlotSummary({ slot }: { slot: AvailabilitySlotView }) {
  const { formatDate, formatTimeRange } = useFormat();
  const t = useTranslations('availability');
  const category = useTranslations('helperProfile.categories');
  return <div className="min-w-0 space-y-2">
    <p className="flex items-start gap-2 font-semibold tabular-nums">
      <CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      <time dateTime={slot.start}>{t('slotWindow', { date: formatDate(slot.start), times: formatTimeRange(slot.start, slot.end) })}</time>
    </p>
    <p>{category(slot.categorySlug)}</p>
    <p className="text-sm font-medium"><AvailabilityPrice pricing={slot.pricing} /></p>
  </div>;
}
