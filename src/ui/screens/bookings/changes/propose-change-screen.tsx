import Link from 'next/link';
import { ArrowLeft, ArrowRight, MessageSquareText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type ProposeChangeHandlers, type ProposeChangePageData } from '@/contracts';
import { backArrow, backLink, pageTitle, sectionTitle, surface, surfacePad } from '@/ui/components/bookings/surface';
import { RouteDialogBody, RouteDialogHeader } from '@/ui/components/layout/route-dialog';
import { cn } from '@/ui/lib/utils';
import { ProposeChangeForm, type ProposeChangeFormProps } from './propose-change-form';

export interface ProposeChangeScreenProps {
  data: ProposeChangePageData;
  handlers: ProposeChangeHandlers;
  now: ISODateTime;
}

export function ProposeChangeScreen(props: ProposeChangeScreenProps) {
  return <ProposeChangeContent {...props} />;
}

type ProposeChangeState = Pick<ProposeChangeFormProps, 'initialInput' | 'initialResult'>;

/** Initial values and results are used only by the preview gallery. */
export function ProposeChangeContent({ data, handlers, now, initialInput, initialResult }: ProposeChangeScreenProps & ProposeChangeState) {
  const t = useTranslations('changes.propose');
  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.app.booking(data.booking.id)} className={backLink}><ArrowLeft aria-hidden="true" className={backArrow} />{t('back')}</Link>
    <header className="space-y-2"><h1 className={pageTitle}>{t('title')}</h1><p className="break-words text-muted-foreground">{data.booking.title}</p></header>
    <ProposeChangeBody data={data} handlers={handlers} now={now} initialInput={initialInput} initialResult={initialResult} />
  </div>;
}

/**
 * The same as a dialog over the booking (src/app/[locale]/@modal). Sending closes it; the booking shows the open change
 * and links to it.
 */
export function ProposeChangeDialogScreen({ data, handlers, now, initialInput, initialResult }: ProposeChangeScreenProps & ProposeChangeState) {
  const t = useTranslations('changes.propose');
  return <>
    <RouteDialogHeader title={t('title')} description={data.booking.title} />
    <RouteDialogBody><ProposeChangeBody data={data} handlers={handlers} now={now} initialInput={initialInput} initialResult={initialResult} /></RouteDialogBody>
  </>;
}

/** The form, or why there can't be one yet (a change is already open): on the page and in the dialog. */
function ProposeChangeBody({ data, handlers, initialInput, initialResult }: ProposeChangeScreenProps & ProposeChangeState) {
  const t = useTranslations('changes.propose');
  return data.openChangeId ? <section className={cn(surface, surfacePad, 'space-y-3 border-info/30 dark:border-info/35')}>
      <h2 className={cn(sectionTitle, 'flex items-center gap-3')}><span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-info/12 text-info"><MessageSquareText className="size-4.5" /></span>{t('blockedTitle')}</h2>
      <p className="text-pretty">{t('blockedDescription')}</p>
      <Link href={routes.app.bookingChange(data.booking.id, data.openChangeId)} className="group/view inline-flex min-h-11 items-center gap-2 rounded-md font-medium text-primary underline underline-offset-4">{t('viewChange')}<ArrowRight aria-hidden="true" className="size-4 shrink-0 transition-transform duration-200 ease-[var(--ease-out)] group-hover/view:translate-x-0.5 motion-reduce:transition-none" /></Link>
    </section> : <ProposeChangeForm key={data.booking.id} data={data} handlers={handlers} initialInput={initialInput} initialResult={initialResult} />;
}
