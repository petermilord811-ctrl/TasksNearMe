import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type AvailabilitySlotView } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { Button } from '@/ui/primitives/button';
import { AvailabilitySlotSummary } from './availability-slot-summary';

export interface AvailabilitySlotListProps {
  slots: AvailabilitySlotView[];
  handle: string;
}

export function AvailabilitySlotList({ slots, handle }: AvailabilitySlotListProps) {
  const t = useTranslations('availability');
  // The helper's market clock (the profile page sets it, completion plan 8.1).
  const { zoneName } = useFormat();
  return <section aria-label={t('openTimes')} className="space-y-4">
    <div className="space-y-2">
      <h2 className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('openTimes')}</h2>
      <p className="text-sm text-muted-foreground">{t('marketTime', { zone: zoneName })}</p>
    </div>
    <ul className="grid gap-4 md:grid-cols-2">
      {slots.map((slot) => <li key={slot.id} className="flex min-w-0 flex-col gap-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card md:p-5 dark:border-white/[0.06]">
        <AvailabilitySlotSummary slot={slot} />
        <Button asChild variant="outline" className="mt-auto w-full"><Link href={routes.app.requestHelper(handle, { slotId: slot.id })}>{t('requestTime')}</Link></Button>
      </li>)}
    </ul>
  </section>;
}
