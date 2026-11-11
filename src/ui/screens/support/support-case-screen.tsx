import Image from 'next/image';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { ArrowLeft, ArrowUpRight, Expand, LockKeyhole } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CaseEventView, type CaseStatus, type ISODateTime, type Photo, type SupportCaseHandlers, type SupportCasePageData } from '@/contracts';
import { formatDate, formatDateTime, formatRelative } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useCaseStatus } from '@/ui/components/status/use-status';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';
import { SupportReplyForm } from './support-reply-form';

export interface SupportCaseScreenProps {
  data: SupportCasePageData;
  handlers: SupportCaseHandlers;
  now: ISODateTime;
}

function CasePhoto({ photo, number, count, sender }: { photo: Photo; number: number; count: number; sender: string }) {
  const t = useTranslations('supportCase');
  const alt = photo.alt || t('photoAlt', { number, count, name: sender });
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" aria-label={t('openPhoto', { description: alt })} className="w-full overflow-hidden rounded-lg border bg-card text-left text-foreground hover:bg-accent">
        <Image src={photo.src} alt={alt} width={photo.width} height={photo.height} unoptimized className="aspect-4/3 h-auto w-full object-cover" />
        <span className="flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-sm font-medium">{t('viewPhoto')}<Expand aria-hidden="true" className="size-4 shrink-0 text-primary" /></span>
      </button>
    </DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-reading max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
      <DialogHeader><DialogTitle>{t('photoTitle', { number, count })}</DialogTitle><DialogDescription>{alt}</DialogDescription></DialogHeader>
      <Image src={photo.src} alt={alt} width={photo.width} height={photo.height} unoptimized className="h-auto max-h-[60dvh] w-full rounded-lg object-contain" />
    </DialogContent>
  </Dialog>;
}

function CaseStatusLine({ status }: { status: CaseStatus }) {
  const label = useCaseStatus(status);
  return <p className="font-medium">{label.label}</p>;
}

function CaseEvent({ event, now }: { event: CaseEventView; now: ISODateTime }) {
  const t = useTranslations('supportCase');
  const sender = t(`sender.${event.from}`);
  const notice = event.kind === 'status';
  return <li className={cn('flex min-w-0', notice ? 'justify-center' : event.from === 'me' ? 'justify-end' : 'justify-start')}>
    <article className={cn('min-w-0 space-y-2 [overflow-wrap:anywhere]', notice ? 'max-w-full px-2 py-2 text-center text-sm text-muted-foreground' : 'max-w-[90%] rounded-xl border p-3 sm:max-w-[80%] sm:p-4', !notice && (event.from === 'me' ? 'border-secondary bg-secondary text-secondary-foreground' : 'bg-background'))}>
      {!notice && <p className="text-sm font-semibold">{sender}</p>}
      {notice && event.status && <CaseStatusLine status={event.status} />}
      {event.body && <p className="whitespace-pre-wrap leading-6">{event.body}</p>}
      {Boolean(event.photos?.length) && <ul aria-label={t('photos')} className="grid max-w-96 grid-cols-1 gap-3 sm:grid-cols-2">
        {event.photos!.map((photo, index) => <li key={photo.id} className="min-w-0"><CasePhoto photo={photo} number={index + 1} count={event.photos!.length} sender={sender} /></li>)}
      </ul>}
      <time dateTime={event.at} title={formatRelative(event.at, now)} className="block text-sm tabular-nums text-muted-foreground">{formatDateTime(event.at)}</time>
    </article>
  </li>;
}

export function SupportCaseScreen(props: SupportCaseScreenProps) {
  return <SupportCaseContent {...props} />;
}

/** State seeds keep reply outcomes visible in previews without submitting on mount. */
export function SupportCaseContent({ data, handlers, now, replyState }: SupportCaseScreenProps & {
  replyState?: Pick<ComponentProps<typeof SupportReplyForm>, 'initialResult' | 'initialPending' | 'initialBody'>;
}) {
  const t = useTranslations('supportCase');
  const support = useTranslations('support');
  const status = useCaseStatus(data.case.status);
  return <div className="mx-auto w-full max-w-reading space-y-6 [overflow-wrap:anywhere]">
    <Link href={routes.app.support()} className={buttonVariants({ variant: 'ghost' })}><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium text-muted-foreground">{support(`kinds.${data.case.kind}`)}</span><StatusBadge {...status} /></div>
      <PageHeader title={data.case.subject} />
      <p className="text-sm tabular-nums text-muted-foreground">{t('opened', { date: formatDate(data.case.openedAt, { withYear: true }) })}</p>
      {data.case.bookingId && <Link href={routes.app.booking(data.case.bookingId)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline underline-offset-4">{t('booking')}<ArrowUpRight aria-hidden="true" className="size-4" /></Link>}
    </div>
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 className="text-xl font-semibold">{t('description')}</h2>
      <p className="whitespace-pre-wrap leading-7">{data.case.description}</p>
    </section>
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t('conversation')}</h2>
      <div role="log" aria-label={t('conversation')} aria-live="polite" aria-relevant="additions text" className="rounded-xl border bg-card p-3 shadow-card sm:p-5">
        {data.events.length ? <ol className="space-y-4">{data.events.map((event) => <CaseEvent key={event.id} event={event} now={now} />)}</ol> : <p className="py-8 text-center text-sm text-muted-foreground">{t('emptyConversation')}</p>}
      </div>
    </section>
    {data.canReply ? <section className="space-y-4"><h2 className="text-xl font-semibold">{t('reply')}</h2><SupportReplyForm key={data.case.id} handlers={handlers} {...replyState} /></section> : <div className="space-y-3 rounded-xl border bg-muted p-4 sm:p-6">
      <p className="flex items-start gap-3"><LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" /><span>{t('closed')}</span></p>
      <Link href={routes.app.support()} className={buttonVariants({ variant: 'outline' })}>{t('newRequest')}</Link>
    </div>}
  </div>;
}
