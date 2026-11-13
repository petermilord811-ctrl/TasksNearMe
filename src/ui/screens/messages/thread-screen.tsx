import Link from 'next/link';
import type { ComponentProps } from 'react';
import { ArrowLeft, ArrowUpRight, LockKeyhole } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type ReportHandlers, type ReportSubject, type ThreadHandlers, type ThreadPageData, type ThreadSubject } from '@/contracts';
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
    case 'series': return routes.app.series(subject.seriesId);
  }
}

export function ThreadScreen({ data, handlers, now, safety }: ThreadScreenProps) {
  return <ThreadContent data={data} handlers={handlers} now={now} safety={safety} />;
}

/**
 * A conversation: who it's with and what it's about on top, then one chat panel (the messages, with the
 * composer pinned under them) that fills the screen and scrolls inside.
 *
 * State seeds keep async outcomes reproducible in the preview gallery.
 */
export function ThreadContent({ data, handlers, now, safety, composerState }: ThreadScreenProps & {
  composerState?: Pick<ComponentProps<typeof MessageComposerContent>, 'initialResult' | 'initialPending' | 'initialBody'>;
}) {
  const t = useTranslations('thread');
  const { thread, messages, composer } = data;

  return <div className="mx-auto w-full max-w-reading space-y-4">
    <Link href={routes.app.messages()} className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2' })}><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>
    <header className="flex min-w-0 items-start gap-3 sm:gap-4">
      <InitialsAvatar initials={thread.otherParty.initials} />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <h1 className="font-display text-2xl leading-tight font-semibold tracking-[-0.02em] sm:text-[1.75rem]">{t('title', { name: thread.otherParty.displayName })}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{thread.title}</p>
        <Link href={subjectHref(thread.subject)} className="group/subject inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">
          {t(`subject.${thread.subject.kind}`)}<ArrowUpRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover/subject:-translate-y-0.5 group-hover/subject:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      </div>
      {safety && <ReportBlockMenu key={safety.subject.userId} subject={safety.subject} handlers={safety.handlers} />}
    </header>
    {thread.contactMasking && <p className="flex items-start gap-2.5 rounded-2xl bg-secondary/70 px-4 py-3 text-sm leading-6 text-secondary-foreground"><LockKeyhole aria-hidden="true" className="mt-1 size-4 shrink-0" /><span>{t('masking')}</span></p>}
    <div className="flex h-[max(32rem,calc(100dvh-21rem))] flex-col overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]">
      <MessageLog key={`log-${thread.id}`} messages={messages} otherParty={thread.otherParty} now={now} className="min-h-0 flex-1" />
      {composer.canSend
        ? <MessageComposerContent key={`composer-${thread.id}`} rules={composer} handlers={handlers} {...composerState} />
        : <p role="status" className="border-t border-foreground/[0.07] bg-muted/60 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm font-medium dark:border-white/[0.06]">{t(`disabled.${composer.disabledReason ?? 'unavailable'}`)}</p>}
    </div>
  </div>;
}
