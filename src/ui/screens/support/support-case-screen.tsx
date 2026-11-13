import Link from 'next/link';
import type { ComponentProps } from 'react';
import { ArrowLeft, ArrowUpRight, LockKeyhole } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CaseEventView, type CaseStatus, type ISODateTime, type SupportCaseHandlers, type SupportCasePageData } from '@/contracts';
import { formatDate, formatDateTime, formatRelative } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useCaseStatus } from '@/ui/components/status/use-status';
import { CasePhoto } from '@/ui/components/support/case-photo';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';
import { SupportReplyForm } from './support-reply-form';

export interface SupportCaseScreenProps {
  data: SupportCasePageData;
  handlers: SupportCaseHandlers;
  now: ISODateTime;
}

function CaseStatusLine({ status, viewerRole }: { status: CaseStatus; viewerRole?: SupportCasePageData['case']['viewerRole'] }) {
  const label = useCaseStatus(status, viewerRole);
  return <p className="font-medium">{label.label}</p>;
}

function CaseEvent({ event, now, viewerRole }: { event: CaseEventView; now: ISODateTime; viewerRole?: SupportCasePageData['case']['viewerRole'] }) {
  const t = useTranslations('supportCase');
  const sender = t(`sender.${event.from}`);
  const notice = event.kind === 'status';
  return <li className={cn('flex min-w-0', notice ? 'justify-center' : event.from === 'me' ? 'justify-end' : 'justify-start')}>
    {/* The same bubbles as messages: yours on the right, support's on the left, status changes as small notes. */}
    <article className={cn(
      'min-w-0 [overflow-wrap:anywhere]',
      notice
        ? 'max-w-full space-y-1 rounded-2xl bg-foreground/[0.045] px-4 py-2 text-center text-sm text-muted-foreground dark:bg-white/[0.06]'
        : cn('max-w-[86%] space-y-1.5 rounded-[1.25rem] px-3.5 py-2.5 sm:max-w-[75%] sm:px-4 sm:py-3', event.from === 'me'
          ? 'rounded-br-md bg-secondary text-secondary-foreground'
          : 'rounded-bl-md border border-foreground/[0.07] bg-background shadow-[0_1px_2px_rgb(23_18_14/0.05)] dark:border-white/[0.07]'),
    )}>
      {!notice && <p className="text-xs font-semibold">{sender}</p>}
      {notice && event.status && <CaseStatusLine status={event.status} viewerRole={viewerRole} />}
      {event.body && <p className="whitespace-pre-wrap leading-6">{event.body}</p>}
      {Boolean(event.photos?.length) && <ul aria-label={t('photos')} className="grid max-w-96 grid-cols-1 gap-3 sm:grid-cols-2">
        {event.photos!.map((photo, index) => <li key={photo.id} className="min-w-0"><CasePhoto photo={photo} number={index + 1} count={event.photos!.length} sender={sender} /></li>)}
      </ul>}
      <time dateTime={event.at} title={formatRelative(event.at, now)} className={cn('block text-xs tabular-nums', event.from === 'me' && !notice ? 'text-right' : 'text-muted-foreground')}>{formatDateTime(event.at)}</time>
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
  const status = useCaseStatus(data.case.status, data.case.viewerRole);
  return <div className="mx-auto w-full max-w-reading space-y-6 [overflow-wrap:anywhere]">
    <Link href={routes.app.support()} className={buttonVariants({ variant: 'ghost' })}><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium text-muted-foreground">{support(`kinds.${data.case.kind}`)}</span><StatusBadge {...status} /></div>
      <PageHeader title={data.case.subject} />
      <p className="text-sm tabular-nums text-muted-foreground">{t('opened', { date: formatDate(data.case.openedAt, { withYear: true }) })}</p>
      {data.case.bookingId && <Link href={routes.app.booking(data.case.bookingId)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline underline-offset-4">{t('booking')}<ArrowUpRight aria-hidden="true" className="size-4" /></Link>}
    </div>
    {data.case.description && <section className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card sm:p-6">
      <h2 className="font-display text-xl font-semibold tracking-[-0.015em]">{t('description')}</h2>
      <p className="whitespace-pre-wrap leading-7">{data.case.description}</p>
    </section>}
    <section className="space-y-4">
      <h2 className="font-display text-xl font-semibold tracking-[-0.015em]">{t('conversation')}</h2>
      <div role="log" aria-label={t('conversation')} aria-live="polite" aria-relevant="additions text" className="rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-3 shadow-card sm:p-5">
        {data.events.length ? <ol className="space-y-2.5">{data.events.map((event) => <CaseEvent key={event.id} event={event} now={now} viewerRole={data.case.viewerRole} />)}</ol> : <p className="py-8 text-center text-sm text-muted-foreground">{t('emptyConversation')}</p>}
      </div>
    </section>
    {data.canReply ? <section className="space-y-4"><h2 className="font-display text-xl font-semibold tracking-[-0.015em]">{t('reply')}</h2><SupportReplyForm key={data.case.id} handlers={handlers} {...replyState} /></section> : <div className="space-y-3 rounded-[1.375rem] bg-muted p-4 sm:p-6">
      <p className="flex items-start gap-3"><LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" /><span>{t('closed')}</span></p>
      <Link href={routes.app.support()} className={buttonVariants({ variant: 'outline' })}>{t('newRequest')}</Link>
    </div>}
  </div>;
}
