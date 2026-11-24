import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, LockKeyhole } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useShownPerson } from '@/ui/lib/shown-person';
import { routes, type ConversationListHandlers, type HelpSummary, type ISODateTime, type ReportHandlers, type ReportSubject, type ThreadHandlers, type ThreadPageData, type ThreadSubject, type ThreadSummary } from '@/contracts';
import { AgreementCard, BookingDayChips } from '@/ui/components/messaging/booking-chat-tools';
import { ConversationActionsMenu } from '@/ui/components/messaging/conversation-actions';
import { ConversationMarks, ConversationMenu, RequestBanner } from '@/ui/components/messaging/conversation-tools';
import { HelpRow } from '@/ui/components/messaging/help-row';
import { InboxList } from '@/ui/components/messaging/inbox-list';
import { cn } from '@/ui/lib/utils';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { SparksBadge } from '@/ui/components/people/sparks-badge';
import { Badge } from '@/ui/primitives/badge';
import { buttonVariants } from '@/ui/primitives/button';
import { MessageComposerContent } from './message-composer';
import { MessageLog } from './message-log';
import { TeamBarView } from '@/ui/components/teams/team-card';
import { ChatAssistProvider, type ChatAssistSeed } from './chat-assist';
import { QuietHoursNote } from '@/ui/components/messaging/quiet-hours-note';
import { ThanksOffer } from '@/ui/components/thanks/thank-you-note';
import { ReplyProvider } from './reply-context';
import { ThreadPresence } from './thread-presence';
import { FamilyNote } from '@/ui/components/family/family-note';

export interface ThreadScreenProps {
  data: ThreadPageData;
  handlers: ThreadHandlers;
  now: ISODateTime;
  safety?: { subject: ReportSubject; handlers: ReportHandlers };
  /** The viewer's other conversations: a list beside this one on wide screens (completion plan 7.3). */
  inbox?: ThreadSummary[];
  /** A message to scroll to and mark: a search's result (`routes.app.thread(id, { from, focus })`, 2026-11-23). */
  focusId?: string;
}

/** Where the conversation's subject lives; a direct conversation with someone who isn't a helper has none. */
export function subjectHref(subject: ThreadSubject): string | undefined {
  switch (subject.kind) {
    case 'offer_for_client': return routes.app.offerView(subject.taskId, subject.offerId);
    case 'task_for_helper': return routes.app.findWorkTask(subject.taskId);
    case 'booking': return routes.app.booking(subject.bookingId);
    case 'series': return routes.app.series(subject.seriesId);
    case 'person': return subject.helperHandle ? routes.helperProfile(subject.helperHandle) : undefined;
  }
}

export function ThreadScreen({ data, handlers, now, safety, inbox, focusId }: ThreadScreenProps) {
  if (!inbox || inbox.length === 0) return <ThreadContent data={data} handlers={handlers} now={now} safety={safety} focusId={focusId} />;
  return <ThreadPanes inbox={inbox} currentId={data.thread.id} now={now}><ThreadContent data={data} handlers={handlers} now={now} safety={safety} focusId={focusId} wide /></ThreadPanes>;
}

/**
 * Wide screens: the conversations beside the open one, like a mail or chat app; phones keep one pane at a time. The
 * page renders the list apart from the conversation, so opening one keeps the list on screen while it loads.
 */
export function ThreadPanes({ inbox, currentId, now, help, listHandlers, children }: {
  inbox: ThreadSummary[];
  currentId: string;
  now: ISODateTime;
  /** TasksNearMe Help, pinned on top (2026-11-22). */
  help?: HelpSummary;
  /** Pin, mute, archive and accept from the list's rows (2026-11-23). */
  listHandlers?: ConversationListHandlers;
  children: ReactNode;
}) {
  const inboxCopy = useTranslations('inbox');
  return <div className="lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start lg:gap-5">
    <aside aria-label={inboxCopy('title')} className="hidden overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card lg:sticky lg:top-24 lg:flex lg:h-[calc(100dvh-8rem)] lg:flex-col dark:border-white/[0.06]">
      <InboxList threads={inbox} now={now} currentId={currentId} variant="pane" pinned={<HelpRow summary={help} now={now} variant="pane" />} {...(listHandlers ? { handlers: listHandlers } : {})} />
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
export function ThreadContent({ data, handlers, now, safety, composerState, assistState, focusId, wide = false }: ThreadScreenProps & {
  composerState?: Pick<ComponentProps<typeof MessageComposerContent>, 'initialResult' | 'initialPending' | 'initialBody' | 'initialSuggestions'>;
  /** "Translate this conversation" on, translations in, or a "Catch me up" card's state (2026-11-24). */
  assistState?: ChatAssistSeed;
  /** Beside the conversation list: it fills its column instead of the reading width. */
  wide?: boolean;
}) {
  const t = useTranslations('thread');
  const { thread, messages, composer } = data;
  // The other person in the page's own words when their account was deleted (J-PR15).
  const other = useShownPerson()(thread.otherParty);
  const closedReason = composer.disabledReason === 'closed' ? composer.closedReason : undefined;
  const subjectLink = subjectHref(thread.subject);
  const firstName = other.deleted ? other.displayName : (other.displayName.split(' ')[0] ?? other.displayName);
  // A direct conversation with a bookable helper: "Send a task request" (a funded direct invite) beside the chat.
  const requestHandle = thread.subject.kind === 'person' && thread.subject.canRequest ? thread.subject.helperHandle : undefined;
  // Suggest replies answers the other person's latest message, when they wrote last (2026-11-23).
  const lastWritten = [...messages].reverse().find((message) => message.kind === 'text');
  const suggestFor = data.assist?.suggest && handlers.onSuggest && lastWritten?.sender === 'them' ? lastWritten.id : undefined;
  // A family member following the booking (2026-11-24): read-only, so the menu offers only the way to the booking.
  const following = Boolean(data.family?.following);
  const menuHandlers: ThreadHandlers = following ? { onSend: handlers.onSend, onUploadPhoto: handlers.onUploadPhoto } : handlers;
  const family = !following && data.family?.manage && handlers.followers ? { panel: data.family.manage, handlers: handlers.followers, helperName: firstName } : undefined;

  // One line on top (back, who, what it's about, the way to it), then the chat panel, which takes the rest of the
  // screen so its composer sits at the bottom (audit M40; the page has no tab dock). The conversation translated and
  // "Catch me up" (2026-11-24) span both: the menu turns them on, the messages show them.
  return <ChatAssistProvider key={thread.id} threadId={thread.id} otherId={thread.otherParty.id}
    {...(data.assist ? { offered: data.assist, ...(data.assist.language ? { language: data.assist.language } : {}) } : {})}
    {...(data.firstUnreadId ? { firstUnreadId: data.firstUnreadId } : {})}
    {...(data.catchUp ? { catchUp: data.catchUp } : {})}
    {...(handlers.onTranslateMany ? { onTranslateMany: handlers.onTranslateMany } : {})}
    {...(handlers.onCatchUp ? { onCatchUp: handlers.onCatchUp } : {})}
    {...(assistState ? { initial: assistState } : {})}>
  <div className={cn('mx-auto flex w-full flex-col gap-3', wide ? 'max-w-reading lg:max-w-none' : 'max-w-reading')}>
    <header className="flex min-w-0 items-center gap-2 sm:gap-3">
      <Link href={routes.app.messages()} aria-label={t('back')} title={t('back')} className={buttonVariants({ variant: 'ghost', size: 'icon', className: cn('-ml-2 size-11 shrink-0 rounded-full', wide && 'lg:hidden') })}><ArrowLeft aria-hidden="true" className="size-5" /></Link>
      <InitialsAvatar initials={other.initials} photo={other.photo} />
      <div className="min-w-0 flex-1">
        {/* The name alone on phones, so it fits; "Messages with …" for screen readers and from 640 px. */}
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate font-display text-lg leading-tight font-semibold tracking-[-0.02em] sm:text-2xl">
            <span aria-hidden="true" className="sm:hidden">{other.displayName}</span>
            <span className="max-sm:sr-only">{t('title', { name: other.displayName })}</span>
          </h1>
          <ConversationMarks thread={thread} />
        </div>
        <div className="flex min-w-0 items-center gap-x-2 text-xs text-muted-foreground sm:text-sm">
          <ThreadPresence threadId={thread.id} presence={data.presence} className="shrink-0 text-xs sm:text-sm" />
          {/* Their @username and Sparks (2026-11-22); a sample profile says so (2026-11-23). */}
          {/* On a phone the row has room for the presence, the handle (shortened if long) and the Sparks total; the
              level's name joins them from 640 px (sweep 2026-11-24: "12 · Newcomer" ran 2 px past a 360 px screen). */}
          {other.username && <span className="min-w-0 truncate">@{other.username}</span>}
          {thread.sample && <Badge variant="outline" className="shrink-0">{t('sampleBadge')}</Badge>}
          {other.sparks && <SparksBadge sparks={other.sparks} compact className="shrink-0 flex-nowrap max-sm:[&_[data-sparks-level]]:hidden" />}
          <span className="truncate">{thread.kind === 'direct' ? t('direct.label') : thread.title}</span>
        </div>
      </div>
      {subjectLink && <Link href={subjectLink} title={t(`subject.${thread.subject.kind}`)} className="group/subject inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:justify-start">
        <span className="max-sm:sr-only">{t(`subject.${thread.subject.kind}`)}</span><ArrowUpRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover/subject:-translate-y-0.5 group-hover/subject:translate-x-0.5 motion-reduce:transition-none" />
      </Link>}
      {/* Search, pin, mute, archive, then Report and Block (2026-11-23). */}
      <ConversationMenu thread={thread} handlers={menuHandlers} safety={following ? undefined : safety} name={other.displayName} now={now} {...(family ? { family } : {})} />
    </header>
    {thread.contactMasking && <p className="flex items-start gap-2.5 rounded-2xl bg-secondary/70 px-4 py-2.5 text-sm leading-6 text-secondary-foreground"><LockKeyhole aria-hidden="true" className="mt-1 size-4 shrink-0" /><span>{thread.kind === 'direct' ? t('direct.masking') : t('masking')}</span></p>}
    {/* Who follows the booking as the client's family (the helper always sees it), or that the viewer follows it. */}
    <FamilyNote family={data.family} />
    {/* A booking that can still change (2026-11-23): the proposal shows in the conversation as a card. */}
    {data.canProposeChange && thread.subject.kind === 'booking' && !data.agreement && <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl border border-foreground/[0.07] bg-card px-4 py-2 text-sm dark:border-white/[0.06]">
      <span className="text-muted-foreground">{t('cards.change.hint')}</span>
      <Link href={routes.app.bookingProposeChange(thread.subject.bookingId)} className="group/change inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline">{t('cards.change.propose')}<ArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover/change:translate-x-0.5 motion-reduce:transition-none" /></Link>
    </p>}
    {requestHandle && <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl border border-foreground/[0.07] bg-card px-4 py-2 text-sm dark:border-white/[0.06]">
      <span className="text-muted-foreground">{t('direct.requestHint', { name: firstName })}</span>
      <Link href={routes.app.requestHelper(requestHandle)} className="group/request inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline">{t('direct.request')}<ArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover/request:translate-x-0.5 motion-reduce:transition-none" /></Link>
    </p>}
    {/* Photos dropped anywhere on the conversation attach to the message (2026-11-23). */}
    <div data-drop-photos="" className={cn('relative flex flex-col overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]', thread.contactMasking ? 'h-[max(24rem,calc(100dvh-var(--app-header-offset,4.25rem)-13rem))]' : 'h-[max(24rem,calc(100dvh-var(--app-header-offset,4.25rem)-9rem))]', 'lg:h-[max(32rem,calc(100dvh-var(--app-header-offset,4.25rem)-10rem))]')}>
      {/* What we agreed, on top of a booking's messages (2026-11-24). */}
      {data.team && <TeamBarView bar={data.team} />}
      {data.agreement && <AgreementCard agreement={data.agreement} threadId={thread.id} canProposeChange={Boolean(data.canProposeChange)} />}
      <ReplyProvider>
      <MessageLog key={`log-${thread.id}`} messages={messages} {...(data.earlier ? { earlierHref: routes.app.thread(thread.id, data.earlier) } : {})} otherParty={other} now={now} readUpTo={data.readUpTo} firstUnreadId={data.firstUnreadId} focusId={focusId} canReply={composer.canSend} {...(composer.canSend && handlers.onReact ? { onReact: handlers.onReact } : {})} {...(data.assist?.translate && handlers.onTranslate ? { onTranslate: handlers.onTranslate } : {})} {...(data.cards ? { cards: data.cards } : {})} {...(handlers.requestCards ? { requestCardHandlers: handlers.requestCards } : {})} {...(handlers.thanks ? { thanksHandlers: handlers.thanks } : {})} {...(handlers.teams ? { teamHandlers: handlers.teams } : {})} className="min-h-0 flex-1" />
      {/* A stranger's first message (2026-11-23): Accept, Ignore or Block; answering accepts too. */}
      {composer.disabledReason !== 'blocked' && <RequestBanner thread={thread} name={firstName} handlers={handlers} {...(safety ? { onBlock: safety.handlers.onBlock } : {})} />}
      {data.thanks?.canWrite && handlers.thanks && <ThanksOffer bookingId={data.thanks.bookingId} name={firstName} onSave={handlers.thanks.onSave} compact className="border-t border-foreground/[0.07] bg-brand-soft/40 px-4 dark:border-white/[0.06]" />}
      {composer.canSend && data.quietHours && <QuietHoursNote name={firstName} until={data.quietHours.until} />}
      {composer.canSend && composer.firstMessagesLeft !== undefined && <p role="note" className="border-t border-foreground/[0.07] bg-muted/40 px-4 py-2 text-xs text-muted-foreground dark:border-white/[0.06]">{t('direct.firstMessagesLeft', { count: composer.firstMessagesLeft, name: firstName })}</p>}
      {/* The booking's day-of updates the app offers now, one tap each (2026-11-24). */}
      {data.bookingActions && thread.subject.kind === 'booking' && <BookingDayChips actions={data.bookingActions} bookingId={thread.subject.bookingId} {...(handlers.onBookingAction ? { onAction: handlers.onBookingAction } : {})} />}
      {composer.canSend
        ? <MessageComposerContent key={`composer-${thread.id}`} rules={composer} handlers={handlers} savedReplies={data.savedReplies} template={{ firstName, task: thread.title }} {...(suggestFor ? { suggestFor } : {})} {...(data.requestOptions ? { actionsMenu: <ConversationActionsMenu options={data.requestOptions} name={firstName} {...(handlers.onAskForOffer ? { onAskForOffer: handlers.onAskForOffer } : {})} {...(handlers.onShareTimes ? { onShareTimes: handlers.onShareTimes } : {})} /> } : {})} {...composerState} />
        : <div role="status" className="border-t border-foreground/[0.07] bg-muted/60 px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] text-center text-sm dark:border-white/[0.06]">
          {/* Why it closed and the way on (audit L13): the offer, the task, the booking or the visits it was about. */}
          <p className="font-medium">{closedReason ? t(`closed.${thread.subject.kind}.${closedReason}`, { name: other.displayName }) : t(`disabled.${composer.disabledReason ?? 'unavailable'}`, { name: firstName })}</p>
          {closedReason && subjectLink && <Link href={subjectLink} className="group/way mt-1 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline">{t(`wayOn.${thread.subject.kind}`)}<ArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover/way:translate-x-0.5 motion-reduce:transition-none" /></Link>}
        </div>}
      </ReplyProvider>
    </div>
  </div>
  </ChatAssistProvider>;
}
