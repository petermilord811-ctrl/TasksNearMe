import Link from 'next/link';
import type { ComponentProps } from 'react';
import { ArrowLeft, ArrowUpRight, LockKeyhole } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type ReportHandlers, type ReportSubject, type ThreadHandlers, type ThreadPageData, type ThreadSubject } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { ReportBlockMenu } from '@/ui/components/safety';
import { buttonVariants } from '@/ui/primitives/button';
import { MessageComposerContent } from './message-composer';
import { MessageLog } from './message-log';

export interface ThreadScreenProps {
  data: ThreadPageData;
  handlers: ThreadHandlers;
  now: ISODateTime;
  safety?: { subject: ReportSubject; handlers: ReportHandlers };
}

function subjectHref(subject: ThreadSubject) {
  switch (subject.kind) {
    case 'offer_for_client': return routes.app.offer(subject.taskId, subject.offerId);
    case 'task_for_helper': return routes.app.findWorkTask(subject.taskId);
    case 'booking': return routes.app.booking(subject.bookingId);
  }
}

export function ThreadScreen({ data, handlers, now, safety }: ThreadScreenProps) {
  return <ThreadContent data={data} handlers={handlers} now={now} safety={safety} />;
}

/** State seeds keep async outcomes reproducible in the preview gallery. */
export function ThreadContent({ data, handlers, now, safety, composerState }: ThreadScreenProps & {
  composerState?: Pick<ComponentProps<typeof MessageComposerContent>, 'initialResult' | 'initialPending' | 'initialBody'>;
}) {
  const t = useTranslations('thread');
  const { thread, messages, composer } = data;

  return <div className="mx-auto w-full max-w-reading space-y-4">
    <Link href={routes.app.messages()} className={buttonVariants({ variant: 'ghost' })}><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>
    <div className="flex min-w-0 flex-wrap items-start gap-3">
      <InitialsAvatar initials={thread.otherParty.initials} />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <PageHeader title={t('title', { name: thread.otherParty.displayName })} description={thread.title} />
        <Link href={subjectHref(thread.subject)} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline underline-offset-4">{t(`subject.${thread.subject.kind}`)}<ArrowUpRight aria-hidden="true" className="size-4" /></Link>
      </div>
      {safety && <ReportBlockMenu key={safety.subject.userId} subject={safety.subject} handlers={safety.handlers} />}
    </div>
    {thread.contactMasking && <p className="flex items-start gap-3 rounded-xl border bg-secondary p-4 text-sm leading-6 text-secondary-foreground"><LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><span>{t('masking')}</span></p>}
    <div className="grid h-[max(36rem,calc(100dvh-22rem))] grid-rows-[minmax(16rem,1fr)_auto] gap-3 pb-[env(safe-area-inset-bottom)]">
      <MessageLog key={`log-${thread.id}`} messages={messages} otherParty={thread.otherParty} now={now} className="h-full min-h-0" />
      {composer.canSend
        ? <MessageComposerContent key={`composer-${thread.id}`} rules={composer} handlers={handlers} {...composerState} />
        : <p role="status" className="rounded-xl border bg-muted p-4 text-center text-sm font-medium">{t(`disabled.${composer.disabledReason ?? 'unavailable'}`)}</p>}
    </div>
  </div>;
}
