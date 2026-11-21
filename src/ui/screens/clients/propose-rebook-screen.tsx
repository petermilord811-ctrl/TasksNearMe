import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type ISODateTime, type PriceBreakdown, type ProposeRebookHandlers, type ProposeRebookPageData, type RebookProposalInput } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { RouteDialogBody, RouteDialogHeader } from '@/ui/components/layout/route-dialog';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { ProposeRebookForm } from './propose-rebook-form';

export interface ProposeRebookScreenProps {
  data: ProposeRebookPageData;
  handlers: ProposeRebookHandlers;
  now: ISODateTime;
}

export interface ProposeRebookPreviewState {
  initialResult?: ActionResult;
  initialPending?: boolean;
  initialBreakdown?: PriceBreakdown;
  initialQuoteFailed?: boolean;
  initialValues?: Pick<RebookProposalInput, 'date' | 'startTime' | 'message' | 'repeat'>;
}

export function ProposeRebookScreen(props: ProposeRebookScreenProps) {
  return <ProposeRebookContent {...props} />;
}

/** Initial state is for previews. App pages use ProposeRebookScreen. */
export function ProposeRebookContent({ data, handlers, now, ...previewState }: ProposeRebookScreenProps & ProposeRebookPreviewState) {
  const t = useTranslations('clients.form');
  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.app.clients()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" />{t('back')}
    </Link>
    <header className="space-y-2">
      <h1 className="font-display text-2xl/8 font-semibold md:text-3xl/9.5 tracking-[-0.025em]">{t('title')}</h1>
      <p className="text-muted-foreground">{t('intro')}</p>
    </header>
    <ProposeRebookBody data={data} handlers={handlers} now={now} {...previewState} />
  </div>;
}

/**
 * The same as a dialog over the booking or My clients (src/app/[locale]/@modal). Sending closes it, and the page it
 * was opened from shows the proposal waiting for the client.
 */
export function ProposeRebookDialogScreen({ data, handlers, now, ...previewState }: ProposeRebookScreenProps & ProposeRebookPreviewState) {
  const t = useTranslations('clients.form');
  return <>
    <RouteDialogHeader title={t('title')} description={t('intro')} />
    <RouteDialogBody><ProposeRebookBody data={data} handlers={handlers} now={now} {...previewState} /></RouteDialogBody>
  </>;
}

/** Who and what (the past task), then the form: on the page and in the dialog. */
function ProposeRebookBody({ data, handlers, now, ...previewState }: ProposeRebookScreenProps & ProposeRebookPreviewState) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('clients.form');
  const categories = useTranslations('helperCard.categories');
  return <>
    <section className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
      <div className="flex items-center gap-3"><InitialsAvatar initials={data.client.initials} photo={data.client.photo} /><div className="min-w-0"><p className="text-sm text-muted-foreground">{t('client')}</p><p className="font-semibold break-words">{data.client.displayName}</p></div></div>
      <div className="space-y-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">{t('pastTask')}</p>
        <h2 className="font-display text-xl/7 font-semibold break-words tracking-[-0.015em]">{data.booking.title}</h2>
        <p className="text-sm text-muted-foreground">{categories(data.booking.categorySlug)}</p>
        <p className="flex items-center gap-2 text-sm"><MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />{data.booking.areaName}</p>
        <p className="text-sm tabular-nums text-muted-foreground">{t('lastStart', { date: formatDateTime(data.booking.lastStart) })}</p>
        <p className="text-sm text-muted-foreground">{t('samePlace')}</p>
      </div>
    </section>
    <ProposeRebookForm key={data.booking.id} data={data} handlers={handlers} now={now} {...previewState} />
  </>;
}
