import Link from 'next/link';
import { ArrowLeft, MessageSquareText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type ProposeChangeHandlers, type ProposeChangePageData } from '@/contracts';
import { ProposeChangeForm, type ProposeChangeFormProps } from './propose-change-form';

export interface ProposeChangeScreenProps {
  data: ProposeChangePageData;
  handlers: ProposeChangeHandlers;
  now: ISODateTime;
}

export function ProposeChangeScreen(props: ProposeChangeScreenProps) {
  return <ProposeChangeContent {...props} />;
}

/** Initial values and results are used only by the preview gallery. */
export function ProposeChangeContent({ data, handlers, initialInput, initialResult }: ProposeChangeScreenProps & Pick<ProposeChangeFormProps, 'initialInput' | 'initialResult'>) {
  const t = useTranslations('changes.propose');
  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.app.booking(data.booking.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline"><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>
    <header className="space-y-2"><h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1><p className="break-words text-muted-foreground">{data.booking.title}</p></header>
    {data.openChangeId ? <section className="space-y-3 rounded-xl border border-info/30 bg-card p-4 shadow-card sm:p-6">
      <h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><MessageSquareText aria-hidden="true" className="size-5 shrink-0 text-info" />{t('blockedTitle')}</h2>
      <p>{t('blockedDescription')}</p>
      <Link href={routes.app.bookingChange(data.booking.id, data.openChangeId)} className="inline-flex min-h-11 items-center rounded-md text-primary underline underline-offset-4">{t('viewChange')}</Link>
    </section> : <ProposeChangeForm key={data.booking.id} data={data} handlers={handlers} initialInput={initialInput} initialResult={initialResult} />}
  </div>;
}
