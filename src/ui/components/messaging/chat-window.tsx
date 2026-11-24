'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, ArrowRight, ChevronUp, LockKeyhole, Maximize2, MessagesSquare, Minus, RotateCcw, SquarePen, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  AssistantTranscript,
  ChatInboxData,
  ChatLoad,
  ChatThreadData,
  ChatThreadHandlers,
  ChatView,
  ChatWindowState,
  ConversationListHandlers,
  DirectChatStart,
  HelpChatData,
  HelpChatHandlers,
  ISODateTime,
  NewChatHandlers,
  ThreadHandlers,
} from '@/contracts';
import { routes } from '@/contracts/routes';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useShownPerson } from '@/ui/lib/shown-person';
import { cn } from '@/ui/lib/utils';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { SparksBadge } from '@/ui/components/people/sparks-badge';
import { Badge } from '@/ui/primitives/badge';
import { buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { MessageComposerContent } from '@/ui/screens/messages/message-composer';
import { MessageLog } from '@/ui/screens/messages/message-log';
import { ChatAssistProvider } from '@/ui/screens/messages/chat-assist';
import { ReplyProvider } from '@/ui/screens/messages/reply-context';
import { subjectHref } from '@/ui/screens/messages/thread-screen';
import { ThreadPresence } from '@/ui/screens/messages/thread-presence';
import { AgreementCard, BookingDayChips } from './booking-chat-tools';
import { TeamBarView } from '@/ui/components/teams/team-card';
import { ConversationActionsMenu } from './conversation-actions';
import { ConversationMarks, ConversationMenu, RequestBanner } from './conversation-tools';
import { FamilyNote } from '@/ui/components/family/family-note';
import { HelpChat } from './help-chat';
import { HelpAvatar, HelpRow } from './help-row';
import { InboxList } from './inbox-list';
import { QuietHoursNote } from './quiet-hours-note';
import { ThanksOffer } from '@/ui/components/thanks/thank-you-note';
import { NewChat } from './new-chat';

export interface ChatWindowProps {
  state: Exclude<ChatWindowState, 'closed'>;
  view: ChatView;
  /** The chat button's count: unread messages, and an unread reply from support. */
  unread: number;
  inbox: ChatLoad<ChatInboxData>;
  thread: ChatLoad<ChatThreadData>;
  help: ChatLoad<HelpChatData>;
  /** New message's chosen person: their first message's form (2026-11-23). */
  start: ChatLoad<DirectChatStart>;
  transcript: AssistantTranscript;
  now: ISODateTime;
  threadHandlers: ChatThreadHandlers;
  helpHandlers: HelpChatHandlers;
  /** New message in the window: suggestions as the @username is typed, and the first message. */
  newChatHandlers: Pick<NewChatHandlers, 'onSearch' | 'onStart'>;
  /** Pin, mute, archive and accept from the list's rows (2026-11-23). */
  listHandlers: ConversationListHandlers;
  /** A message the open conversation scrolls to and marks: a search's result (2026-11-23). */
  focusId?: string;
  /** A search's result chosen: the open conversation from that message. */
  onJump(messageId: string): void;
  /** A conversation in a docked window of its own beside this one (2026-11-23); absent where there's no room. */
  onOpenBeside?: (threadId: string) => void;
  /** Show the list, the Help conversation, a conversation or New message. */
  onShow(view: ChatView): void;
  /** The first message went: the new conversation (`redirectTo`), shown in the window. */
  onStarted(redirectTo: string): void;
  onMinimize(): void;
  onRestore(): void;
  onClose(): void;
  /** Load what's on screen again (after a failure, or when the conversation changed). */
  onRetry(): void;
  /** The open conversation, again (after a message or a reaction). */
  onRefreshThread(): void;
  /** The open conversation from an earlier message on. */
  onLoadEarlier(from: string): Promise<void>;
  /** The page for what's on screen ("Open full page"); following it closes the window. */
  fullPageHref: string;
  onFullPage(): void;
  /** Changes when the person opens the window: focus moves into it. */
  focusKey?: number;
}

const control = buttonVariants({ variant: 'ghost', size: 'icon', className: 'size-9 shrink-0 rounded-full text-foreground/75 hover:text-foreground' });

function Loading() {
  const t = useTranslations('chat.window');
  return <div role="status" className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t('loading')}</div>;
}

function Failed({ onRetry, notFound = false }: { onRetry(): void; notFound?: boolean }) {
  const t = useTranslations('chat.window');
  return <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
    <p>{notFound ? t('notFound') : t('failed')}</p>
    {!notFound && <button type="button" onClick={onRetry} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' })}><RotateCcw aria-hidden="true" />{t('retry')}</button>}
  </div>;
}

/** One conversation in the window: who and what it's about, the messages, and the composer (or why it's closed). */
function ThreadPane({ load, now, handlers, onRetry, onRefresh, onLoadEarlier, focusId, onJump, onIgnored, onOpenBeside, onShowInWindow, controls }: {
  load: ChatLoad<ChatThreadData>;
  now: ISODateTime;
  handlers: ChatThreadHandlers;
  onRetry(): void;
  onRefresh(): void;
  onLoadEarlier(from: string): Promise<void>;
  focusId?: string;
  onJump(messageId: string): void;
  onIgnored(): void;
  /** "Open beside": this conversation in a window of its own, docked beside the chat window (2026-11-23). */
  onOpenBeside?: () => void;
  /** A docked window: back into the chat window (in its menu), and its own buttons (minimize, close) at the header's end. */
  onShowInWindow?: () => void;
  controls?: ReactNode;
}) {
  const t = useTranslations('thread');
  const w = useTranslations('chat.window');
  const person = useShownPerson();
  const loaded = load.status === 'idle' ? undefined : load.data;
  if (!loaded) return load.status === 'error' ? <Failed onRetry={onRetry} notFound={load.notFound} /> : <Loading />;
  const { data, safety } = loaded;
  const { thread, messages, composer } = data;
  const other = person(thread.otherParty);
  const firstName = other.deleted ? other.displayName : (other.displayName.split(' ')[0] ?? other.displayName);
  const subjectLink = subjectHref(thread.subject);
  const closedReason = composer.disabledReason === 'closed' ? composer.closedReason : undefined;
  const requestHandle = thread.subject.kind === 'person' && thread.subject.canRequest ? thread.subject.helperHandle : undefined;
  const id = thread.id;
  const bound: ThreadHandlers = {
    onSend: (input) => handlers.onSend(id, input),
    onUploadPhoto: handlers.onUploadPhoto,
    onTyping: () => handlers.onTyping(id),
    onReact: (input) => handlers.onReact(id, input),
    onSaveReply: handlers.onSaveReply,
    onDeleteReply: handlers.onDeleteReply,
    onFlag: (input) => handlers.onFlag(id, input),
    onAccept: () => handlers.onAccept(id),
    onSearch: (query) => handlers.onSearch(id, query),
    onTranslate: (messageId) => handlers.onTranslate(id, messageId),
    onSuggest: () => handlers.onSuggest(id),
    // GIFs (2026-11-24): only where the app offers them.
    ...(handlers.onSearchGifs && handlers.onAttachGif ? { onSearchGifs: handlers.onSearchGifs, onAttachGif: handlers.onAttachGif } : {}),
    onTranslateMany: (input) => handlers.onTranslateMany(id, input),
    onCatchUp: (input) => handlers.onCatchUp(id, input),
  };
  // Suggest replies answers the other person's latest message, when they wrote last (2026-11-23).
  const lastWritten = [...messages].reverse().find((message) => message.kind === 'text');
  const suggestFor = data.assist?.suggest && lastWritten?.sender === 'them' ? lastWritten.id : undefined;
  // A family member following the booking (2026-11-24): read-only, so the menu offers only the way to the booking.
  const following = Boolean(data.family?.following);
  const menuHandlers: ThreadHandlers = following ? { onSend: bound.onSend, onUploadPhoto: bound.onUploadPhoto } : bound;
  const family = !following && data.family?.manage && handlers.followers ? { panel: data.family.manage, handlers: handlers.followers, helperName: firstName, ...(onRefresh ? { onDone: onRefresh } : {}) } : undefined;
  const safetyMenu = !following && safety ? { subject: safety, handlers: { onReport: (input: Parameters<ChatThreadHandlers['onReport']>[1]) => handlers.onReport(id, input), onBlock: (input: { blocked: boolean }) => handlers.onBlock(id, input) } } : undefined;
  // The header never overlaps itself, however narrow (2026-11-23, owner: "bugs in header"): the name and its line below
  // take what's left after the buttons and wrap; the way to what it's about lives in the menu, with search and the rest.
  // The conversation translated and "Catch me up" (2026-11-24): the menu turns them on, the messages show them.
  return <ChatAssistProvider key={id} threadId={id} otherId={thread.otherParty.id}
    {...(data.assist ? { offered: data.assist, ...(data.assist.language ? { language: data.assist.language } : {}) } : {})}
    {...(data.firstUnreadId ? { firstUnreadId: data.firstUnreadId } : {})}
    {...(data.catchUp ? { catchUp: data.catchUp } : {})}
    onTranslateMany={(input) => handlers.onTranslateMany(id, input)} onCatchUp={(input) => handlers.onCatchUp(id, input)}>
  <section aria-label={w('conversation', { name: other.displayName })} data-drop-photos="" className="@container/thread relative flex min-h-0 flex-1 flex-col">
    <header className="flex min-w-0 items-center gap-2 border-b border-foreground/[0.07] px-2.5 py-1.5 dark:border-white/[0.06]">
      <InitialsAvatar initials={other.initials} photo={other.photo} size="sm" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-center gap-1.5"><h3 className="min-w-0 truncate text-sm leading-5 font-semibold" title={other.displayName}>{other.displayName}</h3><ConversationMarks thread={thread} /></div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
          <ThreadPresence threadId={thread.id} presence={data.presence} className="shrink-0 text-xs" />
          {/* Their @username and Sparks (2026-11-22). */}
          {other.username && <span className="min-w-0 max-w-full truncate">@{other.username}</span>}
          {thread.sample && <Badge variant="outline" className="shrink-0">{t('sampleBadge')}</Badge>}
          {other.sparks && <SparksBadge sparks={other.sparks} compact className="shrink-0 flex-nowrap" />}
          <span className="min-w-0 truncate @max-[24rem]/thread:hidden">{thread.kind === 'direct' ? t('direct.label') : thread.title}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        {/* What it's about, search, side by side, pin, mute, archive, then Report and Block (2026-11-23). */}
        <ConversationMenu thread={thread} handlers={menuHandlers} safety={safetyMenu} name={other.displayName} onJump={onJump} now={now} {...(subjectLink ? { subject: { href: subjectLink, label: t(`subject.${thread.subject.kind}`) } } : {})} {...(onOpenBeside ? { onOpenBeside } : {})} {...(onShowInWindow ? { onShowInWindow } : {})} {...(family ? { family } : {})} />
        {controls}
      </div>
    </header>
    {thread.contactMasking && <p className="flex items-start gap-2 border-b border-foreground/[0.07] bg-secondary/60 px-2.5 py-1.5 text-[11px] leading-4 text-secondary-foreground dark:border-white/[0.06]"><LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /><span>{thread.kind === 'direct' ? t('direct.masking') : t('masking')}</span></p>}
    <FamilyNote family={data.family} compact />
    {data.team && <TeamBarView bar={data.team} compact />}
    {data.agreement && <AgreementCard agreement={data.agreement} threadId={thread.id} canProposeChange={Boolean(data.canProposeChange)} compact />}
    {data.canProposeChange && thread.subject.kind === 'booking' && !data.agreement && <p className="flex flex-wrap items-center justify-between gap-x-3 border-b border-foreground/[0.07] px-3 py-1.5 text-xs dark:border-white/[0.06]">
      <span className="text-muted-foreground">{t('cards.change.hint')}</span>
      <Link href={routes.app.bookingProposeChange(thread.subject.bookingId)} className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">{t('cards.change.propose')}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>
    </p>}
    {requestHandle && <p className="flex flex-wrap items-center justify-between gap-x-3 border-b border-foreground/[0.07] px-3 py-1.5 text-xs dark:border-white/[0.06]">
      <span className="text-muted-foreground">{t('direct.requestHint', { name: firstName })}</span>
      <Link href={routes.app.requestHelper(requestHandle)} className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">{t('direct.request')}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>
    </p>}
    <ReplyProvider>
      <MessageLog key={`log-${thread.id}`} messages={messages} {...(data.earlier ? { earlierHref: routes.app.thread(thread.id, data.earlier), onLoadEarlier: () => onLoadEarlier(data.earlier!.from) } : {})} onRefresh={onRefresh} otherParty={other} now={now} readUpTo={data.readUpTo} firstUnreadId={data.firstUnreadId} focusId={focusId} canReply={composer.canSend} {...(composer.canSend ? { onReact: bound.onReact } : {})} {...(data.assist?.translate ? { onTranslate: bound.onTranslate } : {})} {...(data.cards ? { cards: data.cards } : {})} requestCardHandlers={handlers.requestCards} {...(handlers.thanks ? { thanksHandlers: handlers.thanks } : {})} {...(handlers.teams ? { teamHandlers: handlers.teams } : {})} compact className="min-h-0 flex-1 space-y-4 px-2.5 py-2.5 sm:px-2.5 sm:py-2.5" />
      {composer.disabledReason !== 'blocked' && <RequestBanner thread={thread} name={firstName} handlers={bound} onBlock={(input) => handlers.onBlock(id, input)} onIgnored={onIgnored} compact />}
      {data.thanks?.canWrite && handlers.thanks && <ThanksOffer bookingId={data.thanks.bookingId} name={firstName} onSave={handlers.thanks.onSave} compact className="border-t border-foreground/[0.07] bg-brand-soft/40 dark:border-white/[0.06]" />}
      {composer.canSend && data.quietHours && <QuietHoursNote name={firstName} until={data.quietHours.until} compact />}
      {composer.canSend && composer.firstMessagesLeft !== undefined && <p role="note" className="border-t border-foreground/[0.07] bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground dark:border-white/[0.06]">{t('direct.firstMessagesLeft', { count: composer.firstMessagesLeft, name: firstName })}</p>}
      {data.bookingActions && thread.subject.kind === 'booking' && <BookingDayChips actions={data.bookingActions} bookingId={thread.subject.bookingId} onAction={(input) => handlers.onBookingAction(id, input)} onDone={onRefresh} compact />}
      {composer.canSend
        ? <MessageComposerContent key={`composer-${thread.id}`} compact rules={composer} handlers={bound} savedReplies={data.savedReplies} template={{ firstName, task: thread.title }} onRefresh={onRefresh} {...(suggestFor ? { suggestFor } : {})} {...(data.requestOptions ? { actionsMenu: <ConversationActionsMenu options={data.requestOptions} name={firstName} onAskForOffer={(input) => handlers.onAskForOffer(id, input)} onShareTimes={(input) => handlers.onShareTimes(id, input)} compact /> } : {})} />
        : <div role="status" className="border-t border-foreground/[0.07] bg-muted/60 px-3 py-3 text-center text-sm dark:border-white/[0.06]">
          <p className="font-medium">{closedReason ? t(`closed.${thread.subject.kind}.${closedReason}`, { name: other.displayName }) : t(`disabled.${composer.disabledReason ?? 'unavailable'}`, { name: firstName })}</p>
          {closedReason && subjectLink && <Link href={subjectLink} className="mt-1 inline-flex min-h-9 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">{t(`wayOn.${thread.subject.kind}`)}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
        </div>}
    </ReplyProvider>
  </section>
  </ChatAssistProvider>;
}

/** The conversations, with Help pinned on top. */
function ListPane({ load, view, now, onShow, onRetry, handlers, onOpenBeside }: { load: ChatLoad<ChatInboxData>; view: ChatView; now: ISODateTime; onShow(view: ChatView): void; onRetry(): void; handlers: ConversationListHandlers; onOpenBeside?: (threadId: string) => void }) {
  const t = useTranslations('chat.window');
  const loaded = load.status === 'idle' ? undefined : load.data;
  if (!loaded) return load.status === 'error' ? <Failed onRetry={onRetry} /> : <Loading />;
  const help = <HelpRow summary={loaded.help} now={now} variant="pane" current={view.kind === 'help'} onSelect={() => onShow({ kind: 'help' })} />;
  if (loaded.threads.length === 0) {
    return <div className="flex min-h-0 flex-1 flex-col">{help}<p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p></div>;
  }
  return <InboxList threads={loaded.threads} now={now} variant="pane" currentId={view.kind === 'thread' ? view.threadId : undefined} pinned={help} onSelect={(threadId) => onShow({ kind: 'thread', threadId })} handlers={handlers} {...(onOpenBeside ? { onOpenBeside } : {})} />;
}

function Choose() {
  const t = useTranslations('chat.window');
  return <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
    <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground"><MessagesSquare className="size-6" /></span>
    <p className="font-heading text-base font-semibold">{t('choose')}</p>
    <p className="max-w-60 text-sm text-muted-foreground">{t('chooseBody')}</p>
  </div>;
}

/** The minimized window: a bar in the corner with who it's about and what's unread; a click opens it again. */
function MinimizedBar({ label, avatar, unread, onRestore, onClose }: { label: string; avatar: ReactNode; unread: number; onRestore(): void; onClose(): void }) {
  const t = useTranslations('chat.window');
  return <div data-chat-window="minimized" role="region" aria-label={t('minimizedLabel')} className="app-glass fixed right-6 bottom-6 z-40 hidden w-80 items-center gap-1 rounded-full border border-foreground/[0.08] p-1.5 shadow-[0_18px_40px_-18px_rgb(40_20_5/0.5)] lg:flex dark:border-white/[0.1] dark:shadow-[0_18px_40px_-16px_rgb(0_0_0/0.85)]">
    {/* Named by what it shows (the person, the count), so a voice command that says what's seen works. */}
    <button type="button" onClick={onRestore} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-0.5 pr-2 pl-0.5 text-left hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-ring">
      {avatar}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold"><span className="sr-only">{t('restore')}: </span>{label}</span>
      {unread > 0 && <span className="shrink-0 rounded-full bg-primary px-2 text-xs leading-5 font-semibold text-primary-foreground tabular-nums">{unread > 99 ? '99+' : unread}<span className="sr-only"> {t('unreadWord')}</span></span>}
    </button>
    <button type="button" onClick={onRestore} aria-label={t('restore')} className={control}><ChevronUp aria-hidden="true" className="size-4" /></button>
    <button type="button" onClick={onClose} aria-label={t('close')} className={control}><X aria-hidden="true" className="size-4" /></button>
  </div>;
}

/** The window's size, kept for this browser; null until someone resizes it (then the classes' default applies). */
type Size = { width: number; height: number };
const SIZE_KEY = 'tnm.chat.size';
const MIN = { width: 360, height: 380 };
const STEP = 32;

function limits(): Size {
  const header = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-offset')) || 68;
  return { width: Math.max(MIN.width, window.innerWidth - 48), height: Math.max(MIN.height, window.innerHeight - header - 24) };
}

function clamp(size: Size): Size {
  const max = limits();
  return { width: Math.round(Math.min(max.width, Math.max(MIN.width, size.width))), height: Math.round(Math.min(max.height, Math.max(MIN.height, size.height))) };
}

/**
 * Resizing the window (2026-11-22, owner: "Chat Dialog is not resizable"): it's docked at the bottom right, so it grows
 * up and to the left. Its size stays for this browser; the window shrinks back inside a smaller screen.
 */
function useWindowSize(box: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<Size | null>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null') as Partial<Size> | null;
      return stored && typeof stored.width === 'number' && typeof stored.height === 'number' ? clamp({ width: stored.width, height: stored.height }) : null;
    } catch {
      return null;
    }
  });
  const save = (next: Size | null) => {
    setSize(next);
    try {
      if (next) localStorage.setItem(SIZE_KEY, JSON.stringify(next));
      else localStorage.removeItem(SIZE_KEY);
    } catch {
      // Storage off: the size lasts for this page.
    }
  };
  useEffect(() => {
    if (!size) return;
    const onResize = () => setSize((current) => (current ? clamp(current) : current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [size]);
  const current = (): Size => {
    const rect = box.current?.getBoundingClientRect();
    return size ?? { width: rect?.width ?? 400, height: rect?.height ?? 560 };
  };
  /** A drag from one edge or the corner: x grows the width (leftward), y the height (upward). */
  const drag = (axes: { x: boolean; y: boolean }) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, ...current() };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const sized = (at: PointerEvent): Size => clamp({ width: axes.x ? start.width + (start.x - at.clientX) : start.width, height: axes.y ? start.height + (start.y - at.clientY) : start.height });
    const move = (moved: PointerEvent) => setSize(sized(moved));
    const up = (ended: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      save(sized(ended));
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };
  /** The corner handle from the keyboard: Left and Up grow it, Right and Down shrink it, Home puts it back. */
  const key = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      save(null);
      return;
    }
    const now = current();
    const next = event.key === 'ArrowLeft' ? { ...now, width: now.width + STEP } : event.key === 'ArrowRight' ? { ...now, width: now.width - STEP } : event.key === 'ArrowUp' ? { ...now, height: now.height + STEP } : event.key === 'ArrowDown' ? { ...now, height: now.height - STEP } : null;
    if (!next) return;
    event.preventDefault();
    save(clamp(next));
  };
  return { size, drag, key, reset: () => save(null) };
}

/**
 * The chat window (2026-11-22, owner: "Reddit similar chat"): docked at the bottom right over the page, from 1024 px.
 * From 1280 px two panes, the conversations (TasksNearMe Help pinned on top) beside the open one; below that one pane at
 * a time, with Back. At the top: Open full page, Minimize (a bar in the corner) and Close. Not modal: the page stays
 * usable behind it, Tab moves on past it, and Esc minimizes it. Everything it shows comes in as props (loaded by the app).
 */
export function ChatWindow(props: ChatWindowProps) {
  const { state, view, unread, inbox, thread, help, start, transcript, now, threadHandlers, helpHandlers, newChatHandlers, listHandlers, focusId, onJump, onOpenBeside, onShow, onStarted, onMinimize, onRestore, onClose, onRetry, onRefreshThread, onLoadEarlier, fullPageHref, onFullPage, focusKey } = props;
  const t = useTranslations('chat.window');
  const helpCopy = useTranslations('chat.help');
  const person = useShownPerson();
  const titleId = useId();
  const box = useRef<HTMLElement>(null);
  const resize = useWindowSize(box);

  useEffect(() => {
    if (focusKey && state === 'open') box.current?.focus({ preventScroll: true });
  }, [focusKey, state]);

  const threadData = thread.status === 'idle' ? undefined : thread.data;
  const other = view.kind === 'thread' && threadData ? person(threadData.data.thread.otherParty) : undefined;
  if (state === 'minimized') {
    const label = view.kind === 'help' ? helpCopy('title') : view.kind === 'new' ? t('newMessage') : other ? other.displayName : t('title');
    const avatar = view.kind === 'help' ? <HelpAvatar size="sm" /> : other ? <InitialsAvatar initials={other.initials} photo={other.photo} size="sm" /> : <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><MessagesSquare className="size-4" /></span>;
    return <MinimizedBar label={label} avatar={avatar} unread={unread} onRestore={onRestore} onClose={onClose} />;
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Esc inside the window (not in a menu or dialog opened from it, which close themselves first).
    if (event.key !== 'Escape' || event.defaultPrevented || !box.current?.contains(event.target as Node)) return;
    event.stopPropagation();
    onMinimize();
  };
  const listShown = view.kind === 'list';
  return <section ref={box} data-chat-window="open" role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown} className="@container app-glass fixed right-6 bottom-6 z-40 hidden h-[min(40rem,calc(100dvh-var(--app-header-offset,4.25rem)-3rem))] w-[min(25rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-[1.75rem] border border-foreground/[0.08] shadow-[0_2px_6px_rgb(23_18_14/0.06),0_30px_60px_-24px_rgb(40_20_5/0.55)] outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-2 lg:flex xl:w-[47.5rem] dark:border-white/[0.1] dark:shadow-[0_30px_60px_-20px_rgb(0_0_0/0.85)]" style={{ transformOrigin: 'bottom right', ...(resize.size ? { width: resize.size.width, height: resize.size.height } : {}) }}>
    {/* Resize (2026-11-22): the top and left edges, and the corner, which the keyboard can move too. */}
    <div aria-hidden="true" onPointerDown={resize.drag({ x: false, y: true })} onDoubleClick={resize.reset} className="absolute inset-x-6 top-0 z-10 h-1.5 cursor-ns-resize touch-none" />
    <div aria-hidden="true" onPointerDown={resize.drag({ x: true, y: false })} onDoubleClick={resize.reset} className="absolute inset-y-6 left-0 z-10 w-1.5 cursor-ew-resize touch-none" />
    <button type="button" aria-label={t('resize')} title={t('resizeHint')} onPointerDown={resize.drag({ x: true, y: true })} onKeyDown={resize.key} onDoubleClick={resize.reset} className="group/resize absolute top-0 left-0 z-20 flex size-5 cursor-nwse-resize touch-none items-start justify-start rounded-tl-[1.75rem] p-1 focus-visible:outline-2 focus-visible:outline-ring">
      <span aria-hidden="true" className="size-2 rounded-full bg-foreground/15 transition-colors group-hover/resize:bg-primary group-focus-visible/resize:bg-primary" />
    </button>
    <div className="flex items-center gap-1 border-b border-foreground/[0.07] bg-card/70 px-2 py-1.5 dark:border-white/[0.06]">
      {!listShown && <button type="button" onClick={() => onShow({ kind: 'list' })} aria-label={t('back')} title={t('back')} className={cn(control, '@2xl:hidden')}><ArrowLeft aria-hidden="true" className="size-4" /></button>}
      <h2 id={titleId} className={cn('font-display text-base font-semibold tracking-[-0.01em]', listShown ? 'pl-2' : 'pl-2 @max-2xl:pl-0.5')}>{t('title')}</h2>
      {unread > 0 && <span className="rounded-full bg-primary px-2 text-xs leading-5 font-semibold text-primary-foreground tabular-nums">{t('unread', { count: unread })}</span>}
      <div className="ml-auto flex items-center gap-0.5">
        {/* A conversation with anyone, by their @username (2026-11-22), started right here since 2026-11-23 (owner: "I want
            to do it in live chat box itself"). */}
        <button type="button" onClick={() => onShow({ kind: 'new' })} aria-label={t('newMessage')} title={t('newMessage')} className={control}><SquarePen aria-hidden="true" className="size-4" /></button>
        <Link href={fullPageHref} onClick={onFullPage} aria-label={t('fullPage')} title={t('fullPage')} className={control}><Maximize2 aria-hidden="true" className="size-4" /></Link>
        <button type="button" onClick={onMinimize} aria-label={t('minimize')} title={t('minimize')} className={control}><Minus aria-hidden="true" className="size-4" /></button>
        <button type="button" onClick={onClose} aria-label={t('close')} title={t('close')} className={control}><X aria-hidden="true" className="size-4" /></button>
      </div>
    </div>
    {/* Two panes when the window is wide enough (its own width: it can be resized), one at a time below that. */}
    <div className="grid min-h-0 flex-1 bg-card/85 @2xl:grid-cols-[18rem_minmax(0,1fr)]">
      <div className={cn('min-h-0 flex-col border-foreground/[0.07] @2xl:flex @2xl:border-r dark:border-white/[0.06]', listShown ? 'flex' : 'hidden')}>
        <ListPane load={inbox} view={view} now={now} onShow={onShow} onRetry={onRetry} handlers={listHandlers} {...(onOpenBeside ? { onOpenBeside } : {})} />
      </div>
      <div className={cn('min-h-0 flex-col', listShown ? 'hidden @2xl:flex' : 'flex')}>
        {view.kind === 'thread'
          ? <ThreadPane load={thread} now={now} handlers={threadHandlers} onRetry={onRetry} onRefresh={onRefreshThread} onLoadEarlier={onLoadEarlier} focusId={focusId} onJump={onJump} onIgnored={() => onShow({ kind: 'list' })} {...(onOpenBeside ? { onOpenBeside: () => onOpenBeside(view.threadId) } : {})} />
          : view.kind === 'new'
            ? <NewChat
              variant="pane"
              {...(view.to ? { to: view.to } : {})}
              start={start}
              handlers={newChatHandlers}
              onChoose={(to, person) => onShow(person?.threadId ? { kind: 'thread', threadId: person.threadId } : to ? { kind: 'new', to } : { kind: 'new' })}
              onStarted={onStarted}
              onRetry={onRetry}
            />
          : view.kind === 'help'
            ? help.status !== 'idle' && help.data ? <HelpChat data={help.data} transcript={transcript} handlers={helpHandlers} now={now} /> : help.status === 'error' ? <Failed onRetry={onRetry} /> : <Loading />
            : <Choose />}
      </div>
    </div>
  </section>;
}

// ---- Conversations side by side (2026-11-23, owner: "plan all and implement") ---------------------------------------------

/** A conversation docked beside the chat window, open or minimized to a bar. */
export interface DockedChat {
  threadId: string;
  minimized: boolean;
}

/** A docked window's width, the gap between windows, a minimized chat's head and the page's edge. */
export const DOCKED_WIDTH = 360;
const DOCKED_GAP = 12;
const HEAD = 52;
const EDGE = 24;

/**
 * Where the docked row starts and how many open windows fit (`mainKey`: what the chat window is now: open, minimized or
 * closed). Measured with offsetWidth, the layout's width: the window's opening zoom made a bounding box 5% narrow, and the
 * first docked window covered its edge (2026-11-23, owner: "beside opened chat is conflicted with main chat window").
 */
function useDock(mainKey: string): { offset: number; free: number } {
  const [dock, setDock] = useState({ offset: EDGE + 64 + DOCKED_GAP, free: DOCKED_WIDTH });
  useEffect(() => {
    let frame = 0;
    let tries = 0;
    let watched: HTMLElement | null = null;
    const find = () => document.querySelector<HTMLElement>('[data-chat-window]') ?? document.querySelector<HTMLElement>('[data-chat-launcher="window"]');
    const measure = () => {
      const main = watched ?? find();
      const offset = EDGE + (main ? main.offsetWidth : 64) + DOCKED_GAP;
      setDock({ offset, free: window.innerWidth - offset - EDGE });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    // The chat window's code may still be loading: look again for a few frames.
    const attach = () => {
      const main = find();
      if (!main && tries < 30) {
        tries += 1;
        frame = requestAnimationFrame(attach);
        return;
      }
      watched = main;
      if (main) observer?.observe(main);
      measure();
    };
    frame = requestAnimationFrame(attach);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [mainKey]);
  return dock;
}

/** How many docked windows fit in a width. */
const windowsIn = (space: number) => Math.max(0, Math.floor((space + DOCKED_GAP) / (DOCKED_WIDTH + DOCKED_GAP)));

/** A minimized (or crowded-out) conversation: a round head beside the chat window, its unread count, a close on hover. */
function DockedHead({ name, avatar, unread, onRestore, onClose }: { name: string; avatar: ReactNode; unread: number; onRestore(): void; onClose(): void }) {
  const t = useTranslations('chat.window');
  return <li data-chat-docked="head" className="group/head relative motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75">
    <button type="button" onClick={onRestore} title={name} className="grid size-[3.25rem] place-items-center rounded-full bg-card shadow-[0_10px_28px_-12px_rgb(40_20_5/0.6)] ring-2 ring-card transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none">
      {/* Named by its words, not an aria-label: a label over the avatar's visible initials reads as a mismatch (axe:
          label-content-name-mismatch), and the initials would be read out again. */}
      <span aria-hidden="true" className="grid size-12 place-items-center [&>*]:size-12">{avatar}</span>
      <span className="sr-only">{t('restoreDocked', { name, count: unread })}</span>
    </button>
    {unread > 0 && <span aria-hidden="true" className="pointer-events-none absolute -top-1 -right-1 min-w-5 rounded-full bg-primary px-1.5 text-center text-[0.6875rem] leading-5 font-semibold text-primary-foreground tabular-nums ring-2 ring-background">{unread > 99 ? '99+' : unread}</span>}
    <button type="button" onClick={onClose} aria-label={t('closeDocked', { name })} title={t('closeDocked', { name })} className="absolute -top-1.5 -left-1.5 grid size-6 place-items-center rounded-full bg-foreground text-background opacity-0 shadow transition-opacity group-hover/head:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring">
      <X aria-hidden="true" className="size-3.5" />
    </button>
  </li>;
}

/**
 * Conversations side by side (2026-11-23): "Open beside" docks a conversation in a window of its own to the left of the
 * chat window. As many open windows as fit, the newest nearest the chat window; the rest, and the minimized ones, wait as
 * round heads beside the chat window (2026-11-23, owner: "unable to open more than 2 beside chats. if many opens, show it
 * effectively"). Each window has its messages, composer and live updates. Not modal, as the chat window; Esc in one
 * minimizes it. One `[data-chat-docked-row]` holds them all (page switches lift that one element above the page).
 */
export function DockedChats({ docked, mainKey, loads, now, handlers, onMinimize, onRestore, onClose, onRefresh, onLoadEarlier, onShowInWindow }: {
  docked: DockedChat[];
  /** What the chat window is now (open, minimized, closed), so the row moves with it. */
  mainKey: string;
  loads: Record<string, ChatLoad<ChatThreadData>>;
  now: ISODateTime;
  handlers: ChatThreadHandlers;
  onMinimize(threadId: string): void;
  onRestore(threadId: string): void;
  onClose(threadId: string): void;
  onRefresh(threadId: string): void;
  onLoadEarlier(threadId: string, from: string): Promise<void>;
  /** Back into the chat window (its own pane). */
  onShowInWindow(threadId: string): void;
}) {
  const t = useTranslations('chat.window');
  const person = useShownPerson();
  const opened = docked.filter((chat) => !chat.minimized);
  const { offset, free } = useDock(mainKey);
  if (docked.length === 0) return null;
  // The newest open ones that fit are windows; any others wait as heads with the minimized ones. The heads' column takes
  // its own room whenever one waits (minimized, or more open than fit).
  const alone = windowsIn(free);
  const room = docked.length > opened.length || opened.length > alone ? windowsIn(free - HEAD - DOCKED_GAP) : alone;
  const shown = opened.slice(0, room);
  const shownIds = new Set(shown.map((chat) => chat.threadId));
  const heads = docked.filter((chat) => !shownIds.has(chat.threadId));
  const who = (threadId: string) => {
    const load = loads[threadId] ?? { status: 'idle' };
    const loaded = load.status === 'idle' ? undefined : load.data;
    const other = loaded ? person(loaded.data.thread.otherParty) : undefined;
    return { load, loaded, other, name: other?.displayName ?? t('title') };
  };
  return <div data-chat-docked-row="" className="fixed bottom-6 z-40 hidden flex-row-reverse items-end gap-3 lg:flex" style={{ right: offset }}>
    {heads.length > 0 && <ul aria-label={t('dockedHeads')} className="flex max-h-[calc(100dvh-var(--app-header-offset,4.25rem)-3rem)] flex-col-reverse gap-2.5 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:none]">
      {heads.map((chat) => {
        const { loaded, other, name } = who(chat.threadId);
        const avatar = other ? <InitialsAvatar initials={other.initials} photo={other.photo} size="md" /> : <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground"><MessagesSquare className="size-5" /></span>;
        return <DockedHead key={chat.threadId} name={name} avatar={avatar} unread={loaded?.data.thread.unreadCount ?? 0} onRestore={() => onRestore(chat.threadId)} onClose={() => onClose(chat.threadId)} />;
      })}
    </ul>}
    {shown.map((chat) => {
      const { load, loaded, name } = who(chat.threadId);
      const controls = <>
        <button type="button" onClick={() => onMinimize(chat.threadId)} aria-label={t('minimizeDocked', { name })} title={t('minimizeDocked', { name })} className={control}><Minus aria-hidden="true" className="size-4" /></button>
        <button type="button" onClick={() => onClose(chat.threadId)} aria-label={t('closeDocked', { name })} title={t('closeDocked', { name })} className={control}><X aria-hidden="true" className="size-4" /></button>
      </>;
      return <section key={chat.threadId} data-chat-docked="open" role="dialog" aria-modal="false" aria-label={t('docked', { name })} tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return;
          event.stopPropagation();
          onMinimize(chat.threadId);
        }}
        className="app-glass flex h-[min(34rem,calc(100dvh-var(--app-header-offset,4.25rem)-3rem))] flex-col overflow-hidden rounded-[1.5rem] border border-foreground/[0.08] bg-card/85 shadow-[0_2px_6px_rgb(23_18_14/0.06),0_30px_60px_-24px_rgb(40_20_5/0.55)] outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 dark:border-white/[0.1]"
        style={{ width: DOCKED_WIDTH }}>
        {loaded
          ? <ThreadPane load={load} now={now} handlers={handlers} onRetry={() => onRefresh(chat.threadId)} onRefresh={() => onRefresh(chat.threadId)} onLoadEarlier={(from) => onLoadEarlier(chat.threadId, from)} onJump={() => onShowInWindow(chat.threadId)} onIgnored={() => onClose(chat.threadId)} onShowInWindow={() => onShowInWindow(chat.threadId)} controls={controls} />
          : <>
            <div className="flex justify-end border-b border-foreground/[0.07] px-2 py-1.5 dark:border-white/[0.06]">{controls}</div>
            {load.status === 'error' ? <Failed onRetry={() => onRefresh(chat.threadId)} notFound={load.notFound} /> : <Loading />}
          </>}
      </section>;
    })}
  </div>;
}
