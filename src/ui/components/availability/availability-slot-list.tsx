import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type AvailabilitySlotView } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { AvailabilitySlotSummary } from './availability-slot-summary';

export interface AvailabilitySlotListProps {
  slots: AvailabilitySlotView[];
  handle: string;
}

export function AvailabilitySlotList({ slots, handle }: AvailabilitySlotListProps) {
  const t = useTranslations('availability');
  return <section aria-label={t('openTimes')} className="space-y-4">
    <div className="space-y-2">
      <h2 className="text-xl/7 font-semibold md:text-[22px]/7.5">{t('openTimes')}</h2>
      <p className="text-sm text-muted-foreground">{t('marketTime')}</p>
    </div>
    <ul className="grid gap-4 md:grid-cols-2">
      {slots.map((slot) => <li key={slot.id} className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-card md:p-5">
        <AvailabilitySlotSummary slot={slot} />
        <Button asChild variant="outline" className="mt-auto w-full"><Link href={routes.app.requestHelper(handle, { slotId: slot.id })}>{t('requestTime')}</Link></Button>
      </li>)}
    </ul>
  </section>;
}
