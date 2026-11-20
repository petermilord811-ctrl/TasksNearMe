import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, LockKeyhole } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type ReportHandlers, type ReportSubject, type ThreadHandlers, type ThreadPageData, type ThreadSubject, type ThreadSummary } from '@/contracts';
import { InboxList } from '@/ui/components/messaging/inbox-list';
import { cn } from '@/ui/lib/utils';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { ReportBlockMenu } from '@/ui/components/safety';
import { buttonVariants } from '@/ui/primitives/button';
import { MessageComposerContent } from './message-composer';
import { MessageLog } from './message-log';
import { ReplyProvider } from './reply-context';
import { ThreadPresence } from './thread-presence';

export interface ThreadScreenProps {
  data: ThreadPageData;
  handlers: ThreadHandlers;
  now: ISODateTime;
  safety?: { subject: ReportSubject; handlers: ReportHandlers };
  /** The viewer's other conversations: a list beside this one on wide screens (completion plan 7.3). */
  inbox?: ThreadSummary[];
}

function subjectHref(subject: ThreadSubject) {
  switch (subject.kind) {
    case 'offer_for_client': return routes.app.offer(subject.taskId, subject.offerId);
    case 'task_for_helper': return routes.app.findWorkTask(subject.taskId);
    case 'booking': return routes.app.booking(subject.bookingId);
    case 'series': return routes.app.series(subject.seriesId);
  }
}

export function ThreadScreen({ data, handlers, now, safety, inbox }: ThreadScreenProps) {
  if (!inbox || inbox.length === 0) return <ThreadContent data={data} handlers={handlers} now={now} safety={safety} />;
  return <ThreadPanes inbox={inbox} currentId={data.thread.id} now={now}><ThreadContent data={data} handlers={handlers} now={now} safety={safety} wide /></ThreadPanes>;
}

/**
 * Wide screens: the conversations beside the open one, like a mail or chat app; phones keep one pane at a time. The
 * page renders the list apart from the conversation, so opening one keeps the list on screen while it loads.
 */
export function ThreadPanes({ inbox, currentId, now, children }: { inbox: ThreadSummary[]; currentId: string; now: ISODateTime; children: ReactNode }) {
  const inboxCopy = useTranslations('inbox');
  return <div className="lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start lg:gap-5">
    <aside aria-label={inboxCopy('title')} className="hidden overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card lg:sticky lg:top-24 lg:flex lg:h-[calc(100dvh-8rem)] lg:flex-col dark:border-white/[0.06]">
      <InboxList threads={inbox} now={now} currentId={currentId} variant="pane" />
    </aside>
    {children}
  </div>;
}

/**
 * A conversation: who it's with and what it's about on top, then one chat panel (the messages, with the
 * composer pinned under them) that fills the screen and scrolls inside.
 *
 * State seeds keep async outcomes reproducible in the preview gallery.
 */
export function ThreadContent({ data, handlers, now, safety, composerState, wide = false }: ThreadScreenProps & {
  composerState?: Pick<ComponentProps<typeof MessageComposerContent>, 'initialResult' | 'initialPending' | 'initialBody'>;
  /** Beside the conversation list: it fills its column instead of the reading width. */
  wide?: boolean;
}) {
  const t = useTranslations('thread');
  const { thread, messages, composer } = data;
  const closedReason = composer.disabledReason === 'closed' ? composer.closedReason : undefined;

  // One line on top (back, who, what it's about, the way to it), then the chat panel, which takes the rest of the
  // screen so its composer sits at the bottom (audit M40; the page has no tab dock).
  return <div className={cn('mx-auto flex w-full flex-col gap-3', wide ? 'max-w-reading lg:max-w-none' : 'max-w-reading')}>
    <header className="flex min-w-0 items-center gap-2 sm:gap-3">
      <Link href={routes.app.messages()} aria-label={t('back')} title={t('back')} className={buttonVariants({ variant: 'ghost', size: 'icon', className: cn('-ml-2 size-11 shrink-0 rounded-full', wide && 'lg:hidden') })}><ArrowLeft aria-hidden="true" className="size-5" /></Link>
      <InitialsAvatar initials={thread.otherParty.initials} photo={thread.otherParty.photo} />
      <div className="min-w-0 flex-1">
        {/* The name alone on phones, so it fits; "Messages with …" for screen readers and from 640 px. */}
        <h1 className="truncate font-display text-lg leading-tight font-semibold tracking-[-0.02em] sm:text-2xl">
          <span aria-hidden="true" className="sm:hidden">{thread.otherParty.displayName}</span>
          <span className="max-sm:sr-only">{t('title', { name: thread.otherParty.displayName })}</span>
        </h1>
        <div className="flex min-w-0 items-center gap-x-2 text-xs text-muted-foreground sm:text-sm">
          <ThreadPresence threadId={thread.id} presence={data.presence} className="shrink-0 text-xs sm:text-sm" />
          <span className="truncate">{thread.title}</span>
        </div>
      </div>
      <Link href={subjectHref(thread.subject)} title={t(`subject.${thread.subject.kind}`)} className="group/subject inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:justify-start">
        <span className="max-sm:sr-only">{t(`subject.${thread.subject.kind}`)}</span><ArrowUpRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover/subject:-translate-y-0.5 group-hover/subject:translate-x-0.5 motion-reduce:transition-none" />
      </Link>
      {safety && <ReportBlockMenu key={safety.subject.userId} subject={safety.subject} handlers={safety.handlers} />}
    </header>
    {thread.contactMasking && <p className="flex items-start gap-2.5 rounded-2xl bg-secondary/70 px-4 py-2.5 text-sm leading-6 text-secondary-foreground"><LockKeyhole aria-hidden="true" className="mt-1 size-4 shrink-0" /><span>{t('masking')}</span></p>}
    <div className={cn('flex flex-col overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]', thread.contactMasking ? 'h-[max(24rem,calc(100dvh-var(--app-header-offset,4.25rem)-13rem))]' : 'h-[max(24rem,calc(100dvh-var(--app-header-offset,4.25rem)-9rem))]', 'lg:h-[max(32rem,calc(100dvh-var(--app-header-offset,4.25rem)-10rem))]')}>
      <ReplyProvider>
      <MessageLog key={`log-${thread.id}`} messages={messages} {...(data.earlier ? { earlierHref: routes.app.thread(thread.id, data.earlier) } : {})} otherParty={thread.otherParty} now={now} seenMessageId={data.seenMessageId} firstUnreadId={data.firstUnreadId} canReply={composer.canSend} {...(composer.canSend && handlers.onReact ? { onReact: handlers.onReact } : {})} className="min-h-0 flex-1" />
      {composer.canSend
        ? <MessageComposerContent key={`composer-${thread.id}`} rules={composer} handlers={handlers} savedReplies={data.savedReplies} template={{ firstName: thread.otherParty.displayName.split(' ')[0] ?? '', task: thread.title }} {...composerState} />
        : <div role="status" className="border-t border-foreground/[0.07] bg-muted/60 px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] text-center text-sm dark:border-white/[0.06]">
          {/* Why it closed and the way on (audit L13): the offer, the task, the booking or the visits it was about. */}
          <p className="font-medium">{closedReason ? t(`closed.${thread.subject.kind}.${closedReason}`, { name: thread.otherParty.displayName }) : t(`disabled.${composer.disabledReason ?? 'unavailable'}`)}</p>
          {closedReason && <Link href={subjectHref(thread.subject)} className="group/way mt-1 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline">{t(`wayOn.${thread.subject.kind}`)}<ArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover/way:translate-x-0.5 motion-reduce:transition-none" /></Link>}
        </div>}
      </ReplyProvider>
    </div>
  </div>;
}
