import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type PaymentAttemptResult, type PriceBreakdown, type RequestHelperHandlers, type RequestHelperPageData } from '@/contracts';
import { AvailabilitySlotSummary } from '@/ui/components/availability/availability-slot-summary';
import { RequestHelperForm } from './request-helper-form';

export interface RequestHelperScreenProps {
  data: RequestHelperPageData;
  handlers: RequestHelperHandlers;
  now: ISODateTime;
}

export function RequestHelperScreen(props: RequestHelperScreenProps) {
  return <RequestHelperContent {...props} />;
}

/** Initial results are for previews; app pages use RequestHelperScreen. */
export function RequestHelperContent({ data, handlers, initialResult, initialPending, initialBreakdown }: RequestHelperScreenProps & {
  initialResult?: PaymentAttemptResult;
  initialPending?: boolean;
  initialBreakdown?: PriceBreakdown;
}) {
  const t = useTranslations('invites');
  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.helperProfile(data.helper.handle)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" />{t('back', { helper: data.helper.displayName })}
    </Link>
    <header className="space-y-2">
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title', { helper: data.helper.displayName })}</h1>
      <p className="text-muted-foreground">{t('intro')}</p>
    </header>
    {data.slotUnavailable ? <p role="status" className="rounded-2xl border border-info/30 bg-info/[0.05] p-4">{t('slotUnavailable')}</p> : data.slot && <section className="space-y-3 rounded-[1.375rem] border border-primary/15 bg-primary/[0.04] p-4 sm:p-6 dark:border-primary/25 dark:bg-primary/[0.08]">
      <h2 className="font-heading text-xl/7 font-semibold">{t('slotTitle')}</h2>
      <AvailabilitySlotSummary slot={data.slot} />
    </section>}
    {data.tasks.length === 0 && !data.fromBooking ? <section className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] dark:border-white/[0.06] bg-card p-4 shadow-card sm:p-6">
      <h2 className="font-heading text-xl/7 font-semibold">{t(data.slot && !data.slotUnavailable ? 'noSlotTasksTitle' : 'noTasksTitle')}</h2>
      <p className="text-muted-foreground">{t(data.slot && !data.slotUnavailable ? 'noSlotTasksDescription' : 'noTasksDescription')}</p>
      <Link href={routes.app.newTask()} className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4">{t('postTask')}</Link>
    </section> : <RequestHelperForm key={`${data.helper.id}-${data.slotUnavailable ? 'regular' : data.slot?.id ?? 'regular'}`} data={data} handlers={handlers} initialResult={initialResult} initialPending={initialPending} initialBreakdown={initialBreakdown} />}
  </div>;
}
