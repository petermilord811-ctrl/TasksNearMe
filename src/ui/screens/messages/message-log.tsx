'use client';

import Link, { useLinkStatus } from 'next/link';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, Check, CheckCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionHandler, ConversationCards, ISODateTime, MessageReaction, MessageTranslation, MessageView, PersonSummary, RequestCardHandlers, TeamHandlers, ThankYouHandlers } from '@/contracts';
import { ChangeCardView, OfferAskCardView, SharedTimesCardView, TaskRequestCardView } from '@/ui/components/messaging/conversation-cards';
import { MESSAGE_REACTIONS } from '@/contracts/messaging';
import { Languages, Reply, SmilePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverAnchor } from '@/ui/primitives/popover';
import { PickerAction, ReactionBurst, ReactionPicker, useBubbleGestures } from './message-reactions';
import { REACTION_EMOJI, useReply } from './reply-context';
import { useChatAssist } from './chat-assist';
import { CatchUpCard, TranslatingBar, TranslationNote } from './chat-assist-views';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { useRealtimeConnected } from '@/ui/lib/realtime';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { MessageAttachments } from '@/ui/components/messaging/message-media';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { ThankYouNoteCard } from '@/ui/components/thanks/thank-you-note';
import { TeamInviteCardView } from '@/ui/components/teams/team-card';

function MessageContent({ message }: { message: MessageView }) {
  const { formatTime } = useFormat();
  const timeline = useTranslations('timeline');
  if (message.kind === 'text' || !message.event) return <MaskedText segments={message.segments} />;
  const params = message.event.params;
  return <>{timeline(message.event.type, {
    hasAmount: params?.amountCents !== undefined ? 'yes' : 'no', amount: params?.amountCents !== undefined ? formatMoney(params.amountCents) : '',
    hasMinutes: params?.minutes !== undefined ? 'yes' : 'no', minutes: params?.minutes ?? 0,
    hasHours: params?.hours !== undefined ? 'yes' : 'no', hours: params?.hours !== undefined ? formatHours(params.hours) : '',
    hasTime: params?.at !== undefined ? 'yes' : 'no', time: params?.at !== undefined ? formatTime(params.at) : '',
    // A family follower's name (2026-11-24).
    name: params?.name ?? '',
  })}</>;
}

/** The link's label: while the earlier messages load, a spinner says so (a link's own state, so it's in it). */
function EarlierLabel() {
  const t = useTranslations('thread');
  const { pending } = useLinkStatus();
  return pending ? <><Spinner aria-hidden="true" />{t('loadingEarlier')}</> : <><ArrowUp aria-hidden="true" />{t('loadEarlier')}</>;
}

/** The chat window's "Load earlier messages": a button with its own spinner while the window loads them. */
function EarlierButton({ onLoad }: { onLoad: () => Promise<void> | void }) {
  const t = useTranslations('thread');
  const [pending, setPending] = useState(false);
  return <button type="button" disabled={pending} aria-busy={pending} onClick={() => {
    setPending(true);
    void Promise.resolve(onLoad()).catch(() => undefined).finally(() => setPending(false));
  }} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'min-h-11 rounded-full sm:min-h-9' })}>
    {pending ? <><Spinner aria-hidden="true" />{t('loadingEarlier')}</> : <><ArrowUp aria-hidden="true" />{t('loadEarlier')}</>}
  </button>;
}

/** A line for screen readers: earlier messages loaded above (how many), or one new message. */
type Announcement = { key: string; message?: MessageView; earlierCount?: number };

/** What's new to say between two renders' messages (sweep MN11): earlier ones loaded above, then each new one not your own. */
function newAnnouncements(before: MessageView[], now: MessageView[]): Announcement[] {
  const out: Announcement[] = [];
  const firstId = before[0]?.id;
  const earlier = firstId ? now.findIndex((message) => message.id === firstId) : -1;
  if (earlier > 0) out.push({ key: `earlier-${now[0]!.id}`, earlierCount: earlier });
  const lastId = before.at(-1)?.id;
  const last = lastId ? now.findIndex((message) => message.id === lastId) : -1;
  if (last >= 0) for (const message of now.slice(last + 1)) if (message.sender !== 'me') out.push({ key: message.id, message });
  return out;
}

/** Refresh preserves draft state; only readers already at the bottom follow incoming messages. */
/** Messages from the same person within this long read as one group: their name once, tighter spacing. */
const GROUP_MS = 5 * 60_000;

/**
 * Sent or read, on your own messages (2026-11-24, owner: "sent/read feature with tick/double tick icon"): one tick once
 * it's sent, two in blue once the other person has read it (the second one pops in as it happens).
 */
function DeliveryTicks({ read }: { read: boolean }) {
  const t = useTranslations('thread.delivery');
  const label = t(read ? 'read' : 'sent');
  return <span role="img" aria-label={label} title={label} className={cn('inline-flex shrink-0', read ? 'text-info' : 'opacity-70')}>
    {read
      ? <CheckCheck key="read" aria-hidden="true" className="size-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:duration-300" />
      : <Check key="sent" aria-hidden="true" className="size-4" />}
  </span>;
}

export function MessageLog({ messages, earlierHref, onLoadEarlier, onRefresh, otherParty, now, readUpTo, firstUnreadId, focusId, onReact, onTranslate, cards, requestCardHandlers, thanksHandlers, teamHandlers, canReply = false, compact = false, className }: {
  messages: MessageView[];
  /** "Load earlier messages" (sweep MN11): this conversation from 100 messages earlier. */
  earlierHref?: string;
  /** In the chat window (2026-11-22): load the earlier messages in place, instead of following `earlierHref`. */
  onLoadEarlier?: () => Promise<void> | void;
  /** What reads the conversation again (the chat window's own load); the page refreshes without it. */
  onRefresh?: () => void;
  otherParty: PersonSummary;
  now: ISODateTime;
  /** How far the other person has read: the viewer's messages up to it show two ticks (Read), later ones one (Sent). */
  readUpTo?: ISODateTime;
  firstUnreadId?: string;
  /** A message to bring into view and mark for a moment: a search's result (2026-11-23). */
  focusId?: string;
  onReact?: ActionHandler<{ messageId: string; emoji: MessageReaction; on: boolean }>;
  /** "Translate" on the other person's messages, by id (2026-11-23): where this server offers it. */
  onTranslate?: (messageId: string) => Promise<MessageTranslation | null>;
  /** Task requests and booking changes its lines show as cards (2026-11-23), and the request cards' buttons. */
  cards?: ConversationCards;
  requestCardHandlers?: RequestCardHandlers;
  /** A thank-you note's buttons (2026-11-24): its card in the log, where the note was sent. */
  thanksHandlers?: ThankYouHandlers;
  /** A team invite card's answers (2026-11-24). */
  teamHandlers?: TeamHandlers;
  /** Reply only where one can be sent: not in a closed or blocked conversation. */
  canReply?: boolean;
  /** The chat window's denser bubbles (2026-11-24, owner: "make live chat components a little compact"). */
  compact?: boolean;
  className?: string;
}) {
  const { formatDate, formatDateTime, formatRelative, formatTime, dayKey } = useFormat();
  const t = useTranslations('thread');
  const router = useRouter();
  const logRef = useRef<HTMLDivElement>(null);
  // While the live connection is up, new messages arrive at once (completion plan 7.1): the timer only covers
  // the times it's down.
  const live = useRealtimeConnected();
  // "New messages" stays where it was when the conversation opened, however many arrive while it's open.
  const [unreadFrom] = useState(firstUnreadId);
  const { setReplyTo } = useReply();
  // A reaction shows at once and settles when the page refreshes (the server action refreshes it).
  const [pendingReactions, setPendingReactions] = useState<Record<string, boolean>>({});
  // The picker that's open (a message's id), and the reaction just added (it pops in with a burst: 2026-11-23).
  const [picker, setPicker] = useState<{ id: string; via: 'button' | 'touch' } | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const pickerFrom = useRef<HTMLElement | null>(null);
  const react = (messageId: string, emoji: MessageReaction, on: boolean) => {
    if (!onReact) return;
    const key = `${messageId}:${emoji}`;
    if (on) {
      setBurst(key);
      window.setTimeout(() => setBurst((current) => (current === key ? null : current)), 700);
    }
    setPendingReactions((current) => ({ ...current, [key]: on }));
    // Only this tap's own state lets go: a later tap on the same emoji keeps its own.
    const drop = () => setPendingReactions((current) => {
      if (current[key] !== on) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    // The tap shows at once and stays until the conversation's own data says the same (the refresh after the action,
    // below), so it never blinks off in between (2026-11-24, owner: "emoji is reacted and disappeared and reacted again").
    // A refusal or a failure takes it back at once; a refresh that never comes lets go after a while.
    void onReact({ messageId, emoji, on }).then((result) => { if (!result.ok) drop(); }, drop);
    window.setTimeout(drop, 20_000);
  };
  // Reactions the conversation's data now shows as tapped settle (React's "adjust state when props change").
  const [reactionsSeenIn, setReactionsSeenIn] = useState(messages);
  if (reactionsSeenIn !== messages) {
    setReactionsSeenIn(messages);
    const settled = Object.entries(pendingReactions).filter(([key, on]) => {
      const cut = key.lastIndexOf(':');
      const message = messages.find((item) => item.id === key.slice(0, cut));
      return (message?.reactions?.find((reaction) => reaction.emoji === key.slice(cut + 1))?.mine ?? false) === on;
    });
    if (settled.length > 0) {
      setPendingReactions((current) => {
        const next = { ...current };
        for (const [key] of settled) delete next[key];
        return next;
      });
    }
  }
  // The whole conversation translated, and "Catch me up" (2026-11-24): from the conversation's provider, where it has one.
  const assist = useChatAssist();
  const translating = assist?.translating ?? false;
  const translatePaused = assist?.paused ?? false;
  const wantTranslations = assist?.want;
  const otherFirstName = otherParty.displayName.split(' ')[0] ?? otherParty.displayName;
  const catchUpState = assist && assist.catchUp.status !== 'idle' ? assist.catchUp : undefined;
  // Above "New messages" (where the summary starts), or after the latest messages when nothing was unread.
  const cardBefore = catchUpState && assist?.catchUpFrom && messages.some((message) => message.id === assist.catchUpFrom) ? assist.catchUpFrom : undefined;
  const cardAtEnd = Boolean(catchUpState) && !cardBefore;
  const catchUpCard = assist && catchUpState ? <CatchUpCard state={catchUpState} name={otherFirstName} compact={compact} onAsk={assist.askCatchUp} onDismiss={assist.dismissCatchUp} /> : null;
  // Translations asked for in this visit (never stored): each message's, shown under it until "Show original" (2026-11-23).
  const [translations, setTranslations] = useState<Record<string, { status: 'loading' | 'error' } | { status: 'ready'; text: string; shown: boolean }>>({});
  const translate = (messageId: string) => {
    if (!onTranslate) return;
    const current = translations[messageId];
    if (current?.status === 'ready') {
      setTranslations((all) => ({ ...all, [messageId]: { ...current, shown: !current.shown } }));
      return;
    }
    if (current?.status === 'loading') return;
    setTranslations((all) => ({ ...all, [messageId]: { status: 'loading' } }));
    void onTranslate(messageId)
      .catch(() => null)
      .then((answer) => setTranslations((all) => ({ ...all, [messageId]: answer ? { status: 'ready', text: answer.text, shown: true } : { status: 'error' } })));
  };
  // Touch: a long press opens a bubble's picker, a double tap sends a heart (or takes it back).
  const mineAlready = (message: MessageView, emoji: MessageReaction) => pendingReactions[`${message.id}:${emoji}`] ?? message.reactions?.find((reaction) => reaction.emoji === emoji)?.mine ?? false;
  const gestures = useBubbleGestures({
    // Always something to offer: Copy at least, so a long press never just blocks the phone's own text selection.
    onLongPress: (id) => setPicker({ id, via: 'touch' }),
    onDoubleTap: (id) => {
      const message = messages.find((item) => item.id === id);
      if (message && onReact) react(id, 'heart', !mineAlready(message, 'heart'));
    },
  });
  const liveRef = useRef(live);
  useEffect(() => { liveRef.current = live; }, [live]);
  const refreshRef = useRef(onRefresh);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (refreshRef.current) refreshRef.current();
      else router.refresh();
    };
    const timer = window.setInterval(() => { if (!liveRef.current) refresh(); }, 15_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  // What a screen reader hears (sweep MN11): the conversation itself isn't a live region, so earlier messages loaded above
  // are one line ("Loaded 12 earlier messages") and new ones from the other person, or the app, are read out as they
  // come. Your own aren't (you just sent them); the first messages on opening aren't either. Worked out as the messages
  // change, from the ones before (React's pattern for keeping what an earlier render had).
  const [heard, setHeard] = useState<{ messages: MessageView[]; announcements: Announcement[] }>({ messages, announcements: [] });
  if (heard.messages !== messages) {
    const next = newAnnouncements(heard.messages, messages);
    setHeard({ messages, announcements: next.length > 0 ? [...heard.announcements, ...next].slice(-5) : heard.announcements });
  }

  // Earlier messages come in above the ones shown (sweep MN11): the reader stays where they were.
  const shown = useRef({ firstId: messages[0]?.id, height: 0 });
  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const before = shown.current;
    // Where the reader is now, read from the log itself, not from the last scroll event: those arrive a frame later, and a
    // render can land first. Under load (both e2e projects, now and then), a scroll to the top wasn't heard yet, so the
    // old bottom position was used and the reader was thrown 100 messages down.
    const top = log.scrollTop;
    const earlierCameIn = before.firstId !== undefined && messages[0]?.id !== before.firstId && messages.some((message) => message.id === before.firstId);
    // At the bottom before this render (or opening: nothing shown yet), so the newest stays in view.
    const wasAtBottom = before.height - top - log.clientHeight <= 40;
    log.scrollTop = earlierCameIn ? top + log.scrollHeight - before.height : wasAtBottom ? log.scrollHeight : top;
    shown.current = { firstId: messages[0]?.id, height: log.scrollHeight };
  }, [messages]);

  // A search's result (2026-11-23): into view once it's in the log, marked for a moment. After the scroll position above,
  // so it wins over "stay at the bottom".
  const [marked, setMarked] = useState<string | undefined>(undefined);
  const focusedFor = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!focusId || focusedFor.current === focusId) return;
    const node = logRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(focusId)}"]`);
    if (!node) return;
    focusedFor.current = focusId;
    node.scrollIntoView({ block: 'center' });
    const mark = window.setTimeout(() => setMarked(focusId), 0);
    const unmark = window.setTimeout(() => setMarked(undefined), 2600);
    return () => {
      window.clearTimeout(mark);
      window.clearTimeout(unmark);
    };
  }, [focusId, messages]);

  // "Catch me up" in view as it's offered, asked for or answered (2026-11-24): above "New messages", the card on top with
  // the first unread under it; after the latest messages, the newest still in view above it. Only the log scrolls.
  const catchUpStatus = catchUpState?.status;
  useLayoutEffect(() => {
    const log = logRef.current;
    const card = catchUpStatus ? log?.querySelector<HTMLElement>('[data-catch-up]') : null;
    if (!log || !card) return;
    const box = log.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    if (rect.top >= box.top && rect.bottom <= box.bottom) return;
    log.scrollTop += cardAtEnd && rect.height < box.height ? rect.bottom - box.bottom + 12 : rect.top - box.top - 12;
    shown.current.height = log.scrollHeight;
  }, [catchUpStatus, cardAtEnd]);

  // "Translate this conversation" (2026-11-24): the other person's messages as they come into view (and a screen's worth
  // around), newest first, a few at a time; each once a visit (the provider keeps what's asked).
  useEffect(() => {
    const log = logRef.current;
    if (!translating || translatePaused || !wantTranslations || !log) return;
    const ids = (nodes: Iterable<Element>) => [...nodes].map((node) => (node as HTMLElement).dataset.translateId ?? '').filter(Boolean).reverse();
    const nodes = log.querySelectorAll('[data-translate-id]');
    if (typeof IntersectionObserver === 'undefined') {
      wantTranslations(ids(nodes));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      const inView = ids(entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target));
      if (inView.length > 0) wantTranslations(inView);
    }, { root: log, rootMargin: '480px 0px' });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [translating, translatePaused, wantTranslations, messages]);

  // The message box grows under the log (photos to send, a reply, more lines) and the log gets shorter: a reader at the
  // bottom stays there, the newest message in full view (2026-11-23, owner: "unable to scroll to bottom to see photo").
  useEffect(() => {
    const log = logRef.current;
    if (!log || typeof ResizeObserver === 'undefined') return;
    let height = log.clientHeight;
    const observer = new ResizeObserver(() => {
      const next = log.clientHeight;
      if (next < height && log.scrollHeight - log.scrollTop - height <= 40) log.scrollTop = log.scrollHeight;
      height = next;
    });
    observer.observe(log);
    return () => observer.disconnect();
  }, []);

  const days = new Map<string, MessageView[]>();
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    const day = days.get(key) ?? [];
    day.push(message);
    days.set(key, day);
  }

  return <>
  <TranslatingBar name={otherFirstName} compact={compact} />
  <div aria-live="polite" aria-relevant="additions" className="sr-only">
    {heard.announcements.map((item) => <p key={item.key}>{item.message ? <>{item.message.sender === 'them' ? otherParty.displayName : t('system')}: <MessageContent message={item.message} /></> : t('loadedEarlier', { count: item.earlierCount ?? 0 })}</p>)}
  </div>
  {/* Not a live region (aria-live off; a log is polite by default): the line above announces what's new. */}
  <div ref={logRef} role="log" aria-label={t('log')} aria-live="off" tabIndex={0}
    onScroll={(event) => {
      // Photos and reactions change the height between renders too.
      shown.current.height = event.currentTarget.scrollHeight;
    }}
    className={cn('space-y-6 overflow-y-auto overscroll-contain px-3 py-4 [overflow-anchor:none] sm:px-5 sm:py-5', className)}>
    {earlierHref && <p className="flex justify-center">
      {/* The same page with more above (replace: Back still leaves the conversation); it keeps its place (scroll). In the
          chat window, the window loads them in place. */}
      {onLoadEarlier
        ? <EarlierButton onLoad={onLoadEarlier} />
        : <Link href={earlierHref} replace scroll={false} prefetch={false} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'min-h-11 rounded-full sm:min-h-9' })}><EarlierLabel /></Link>}
    </p>}
    {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>}
    {Array.from(days, ([day, entries]) => <section key={day} aria-label={formatDate(entries[0]!.createdAt, { withYear: true })} className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* A day separator, not a sticky chip: a sticky one covered photos while scrolling (UI-021). */}
      <h2 className={cn('mx-auto w-fit rounded-full bg-foreground/[0.05] text-center font-semibold text-muted-foreground dark:bg-white/[0.07]', compact ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs')}><time dateTime={day}>{formatDate(entries[0]!.createdAt, { withYear: true })}</time></h2>
      <ol className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
        {entries.map((message, index) => {
          const previous = entries[index - 1];
          // The same person, a moment later: no name again, closer to the one before.
          const grouped = Boolean(previous && previous.kind === 'text' && message.kind === 'text' && previous.sender === message.sender && Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUP_MS && message.id !== unreadFrom);
          const newLine = message.id === unreadFrom
            ? <li><p className="flex items-center gap-3 py-1 text-xs font-semibold text-primary"><span aria-hidden="true" className="h-px flex-1 bg-primary/40" />{t('newMessages')}<span aria-hidden="true" className="h-px flex-1 bg-primary/40" /></p></li>
            : null;
          // "Catch me up" goes above "New messages" (2026-11-24).
          const divider = message.id === cardBefore ? <><li className="py-1">{catchUpCard}</li>{newLine}</> : newLine;
          const sender = message.sender === 'me' ? t('you') : message.sender === 'them' ? otherParty.displayName : t('system');
          const isNotice = message.kind !== 'text';
          const mine = message.sender === 'me';
          const time = <time dateTime={message.createdAt} title={formatRelative(message.createdAt, now)} className={cn('tabular-nums', compact ? 'text-[11px]' : 'text-xs', isNotice ? 'text-muted-foreground' : 'block', !isNotice && (mine ? 'text-right' : 'text-muted-foreground'))}>
            <span aria-hidden="true">{formatTime(message.createdAt)}</span><span className="sr-only">{formatDateTime(message.createdAt)}</span>
          </time>;
          // A task request or a booking change (2026-11-23): its card, as it stands now.
          const requestCard = isNotice && message.event?.type === 'invite_sent' && message.event.params?.inviteId ? cards?.requests?.[message.event.params.inviteId] : undefined;
          const changeCard = isNotice && message.event?.type === 'change_proposed' && message.event.params?.changeId ? cards?.changes?.[message.event.params.changeId] : undefined;
          const askCard = isNotice && message.event?.type === 'offer_requested' ? cards?.offerAsks?.[message.id] : undefined;
          const timesCard = isNotice && message.event?.type === 'times_shared' ? cards?.sharedTimes?.[message.id] : undefined;
          const thanksCard = isNotice && message.event?.type === 'thanks_sent' && message.event.params?.noteId ? cards?.thanks?.[message.event.params.noteId] : undefined;
          const firstName = otherParty.displayName.split(' ')[0] ?? otherParty.displayName;
          // A team invite (2026-11-24): the card as it stands now, for the viewer.
          const teamCard = isNotice && (message.event?.type === 'team_invited' || message.event?.type === 'team_proposed') && message.event.params?.teamId ? cards?.teams?.[message.event.params.teamId] : undefined;
          if (teamCard) return <Fragment key={message.id}>{divider}<li data-message-id={message.id} className="flex min-w-0 justify-center"><TeamInviteCardView card={teamCard} createdAt={message.createdAt} {...(teamHandlers ? { handlers: teamHandlers } : {})} {...(onRefresh ? { onDone: onRefresh } : {})} /></li></Fragment>;
          if (thanksCard) return <Fragment key={message.id}>{divider}<li data-message-id={message.id} className="flex min-w-0 justify-center"><ThankYouNoteCard note={thanksCard} name={firstName} {...(thanksHandlers ? { handlers: thanksHandlers } : {})} compact={compact} /></li></Fragment>;
          if (requestCard || changeCard || askCard || timesCard) return <Fragment key={message.id}>{divider}<li data-message-id={message.id} className="flex min-w-0 justify-center">
            {requestCard
              ? <TaskRequestCardView card={requestCard} name={firstName} createdAt={message.createdAt} {...(requestCardHandlers ? { handlers: requestCardHandlers } : {})} {...(onRefresh ? { onDone: onRefresh } : {})} />
              : askCard ? <OfferAskCardView card={askCard} name={firstName} createdAt={message.createdAt} />
                : timesCard ? <SharedTimesCardView card={timesCard} name={firstName} createdAt={message.createdAt} />
                : <ChangeCardView card={changeCard!} name={firstName} createdAt={message.createdAt} />}
          </li></Fragment>;
          // Updates ("On the way", an offer received…) are small notes between the bubbles.
          if (isNotice) return <Fragment key={message.id}>{divider}<li className="flex min-w-0 justify-center">
            <article className={cn('inline-flex max-w-full flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 rounded-full bg-foreground/[0.045] text-center text-muted-foreground [overflow-wrap:anywhere] dark:bg-white/[0.06]', compact ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-sm')}>
              <p className="sr-only">{sender}</p>
              <p className="text-sm font-medium text-foreground/80"><MessageContent message={message} /></p>
              {time}
            </article>
          </li></Fragment>;
          const replyTo = () => setReplyTo({ id: message.id, name: sender, text: message.segments.map((segment) => (segment.kind === 'text' ? segment.text : segment.kind === 'mention' ? `@${segment.name}` : '•••')).join('').slice(0, 120) });
          // The whole conversation translated (2026-11-24): its translation in the bubble, "Show original" under it. One
          // message's Translate steps aside meanwhile.
          const auto = translating && message.sender === 'them' ? assist?.translations[message.id] : undefined;
          const autoText = auto?.status === 'ready' && !assist?.originals.has(message.id) ? auto.text : undefined;
          const canTranslate = Boolean(onTranslate) && message.sender === 'them' && !translating;
          const translation = translations[message.id];
          const showingTranslation = translation?.status === 'ready' && translation.shown;
          const plainText = message.segments.map((segment) => (segment.kind === 'text' ? segment.text : segment.kind === 'mention' ? `@${segment.name}` : '')).join('');
          // Reactions under the bubble (completion plan 7.3; animated 2026-11-23): each emoji with its count; yours are
          // marked, and a tap takes one back. The one just added pops in with a little burst.
          const pills = MESSAGE_REACTIONS.flatMap((emoji) => {
            const given = message.reactions?.find((reaction) => reaction.emoji === emoji);
            const mineNow = mineAlready(message, emoji);
            const count = (given?.count ?? 0) - (given?.mine ? 1 : 0) + (mineNow ? 1 : 0);
            return count > 0 ? [{ emoji, count, mine: mineNow }] : [];
          });
          const hasActions = canReply || Boolean(onReact) || canTranslate;
          return <Fragment key={message.id}>{divider}<li data-message-id={message.id} {...(translating && message.sender === 'them' && plainText.trim() ? { 'data-translate-id': message.id } : {})} className={cn('group/msg flex min-w-0 flex-col rounded-[1.5rem] transition-[background-color,box-shadow] duration-700', mine ? 'items-end' : 'items-start', grouped && (compact ? '-mt-1' : '-mt-1.5'), marked === message.id && 'bg-primary/10 ring-2 ring-primary/40')}>
            <Popover open={picker?.id === message.id} onOpenChange={(open) => { if (!open) setPicker(null); }}>
            <PopoverAnchor asChild>
            <article {...gestures(message.id)} className={cn(
              'relative min-w-0 [overflow-wrap:anywhere] [-webkit-touch-callout:none]',
              compact ? 'max-w-[88%] space-y-1 rounded-[1.1rem] px-3 py-1.5' : 'max-w-[86%] space-y-1.5 rounded-[1.25rem] px-3.5 py-2.5 sm:max-w-[75%] sm:px-4 sm:py-3',
              mine
                ? 'rounded-br-md bg-secondary text-secondary-foreground'
                : 'rounded-bl-md border border-foreground/[0.07] bg-background shadow-[0_1px_2px_rgb(23_18_14/0.05)] dark:border-white/[0.07]',
            )}>
              {/* Your own bubbles don't need your name on them; it's still read out. */}
              <p className={cn('font-semibold text-muted-foreground', compact ? 'text-[11px]' : 'text-xs', (mine || grouped) && 'sr-only')}>{sender}</p>
              {message.replyTo && <blockquote className="border-l-2 border-primary/50 pl-2.5 text-[13px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                <span className="font-semibold">{message.replyTo.sender === 'me' ? t('you') : otherParty.displayName}: </span><MaskedText segments={message.replyTo.segments} />
              </blockquote>}
              <p className={compact ? 'text-[14px] leading-[1.35rem]' : 'text-[15px] leading-6'}>{autoText !== undefined ? <span lang={assist?.language} className="whitespace-pre-wrap">{autoText}</span> : <MessageContent message={message} />}</p>
              {auto && <TranslationNote messageId={message.id} translation={auto} />}
              {!translating && translation && translation.status !== 'loading' && (translation.status !== 'ready' || translation.shown) && <div className="space-y-0.5 border-t border-foreground/[0.08] pt-1.5 dark:border-white/[0.08]">
                <p className="text-xs font-semibold text-muted-foreground">{t('translate.label')}</p>
                {translation.status === 'ready' ? <p className="text-[15px] leading-6 whitespace-pre-wrap">{translation.text}</p> : <p role="alert" className="text-sm text-destructive">{t('translate.failed')}</p>}
              </div>}
              <MessageAttachments attachments={message.attachments} sender={sender} className="pt-1" />
              {mine ? <p className="flex items-center justify-end gap-1">{time}<DeliveryTicks read={Boolean(readUpTo && message.createdAt <= readUpTo)} /></p> : time}
              {pills.length > 0 && <ul aria-label={t('reactions.label')} className={cn('flex flex-wrap gap-1 pt-0.5', mine && 'justify-end')}>
                {pills.map((reaction) => {
                  const key = `${message.id}:${reaction.emoji}`;
                  return <li key={reaction.emoji} className="relative">
                    <button type="button" disabled={!onReact} aria-pressed={reaction.mine} onClick={() => react(message.id, reaction.emoji, !reaction.mine)} className={cn('inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors', reaction.mine ? 'border-primary/40 bg-brand-soft' : 'border-foreground/[0.1] bg-card hover:bg-accent')}>
                      <span aria-hidden="true" className={cn('inline-block text-sm leading-none', burst === key && 'reaction-pop')}>{REACTION_EMOJI[reaction.emoji]}</span><span className="sr-only">{t(`reactions.${reaction.emoji}`)}</span>{reaction.count}
                    </button>
                    {burst === key && <ReactionBurst />}
                  </li>;
                })}
              </ul>}
              {/* Wide screens: React, Reply and Translate come up under the bubble while the pointer or the keyboard is
                  near (owner, 2026-11-24: "show on the bottom side"); touch screens use a long press instead (the
                  picker carries the same actions). Under its outer side, the side the bubble is aligned to, so the row
                  never runs off a narrow bubble; just over the bubble's bottom padding (never over its time, ticks or
                  reactions), so the pointer moves onto it without leaving the message. Hidden, it takes no clicks: it
                  would sit over the next message. While its picker is open the picker takes its place (opening under
                  the bubble from React), and focus comes back to React as it closes. */}
              {hasActions && <div role="group" aria-label={t('actions.label', { name: sender })} className={cn('pointer-events-none absolute z-10 flex items-center gap-0.5 rounded-full border border-foreground/[0.08] bg-card p-0.5 opacity-0 shadow-[0_6px_18px_-8px_rgb(40_20_5/0.45)] transition-opacity group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 [@media(pointer:coarse)]:hidden dark:border-white/[0.1]', compact ? 'top-[calc(100%-0.375rem)]' : 'top-[calc(100%-0.5rem)]', mine ? 'right-2' : 'left-2', picker?.id === message.id && 'invisible')}>
                {onReact && <button type="button" aria-label={t('reactions.react')} title={t('reactions.react')} aria-haspopup="dialog" aria-expanded={picker?.id === message.id} onClick={(event) => { pickerFrom.current = event.currentTarget; setPicker({ id: message.id, via: 'button' }); }} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                  <SmilePlus aria-hidden="true" className="size-4" />
                </button>}
                {canReply && <button type="button" onClick={replyTo} aria-label={t('actions.reply')} title={t('actions.reply')} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                  <Reply aria-hidden="true" className="size-4" />
                </button>}
                {/* Translate (2026-11-23): their words in the reader's language, under the message; again: the original. */}
                {canTranslate && <button type="button" onClick={() => translate(message.id)} disabled={translation?.status === 'loading'} aria-busy={translation?.status === 'loading'} aria-pressed={showingTranslation} aria-label={showingTranslation ? t('translate.original') : t('translate.action')} title={showingTranslation ? t('translate.original') : t('translate.action')} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                  {translation?.status === 'loading' ? <Spinner aria-hidden="true" className="size-4" /> : <Languages aria-hidden="true" className="size-4" />}
                </button>}
              </div>}
            </article>
            </PopoverAnchor>
            {picker?.id === message.id && (Boolean(onReact) || canReply || canTranslate || plainText.length > 0) && <ReactionPicker
              label={mine ? t('reactions.pickerMine') : t('reactions.picker', { name: sender })}
              side={picker.via === 'button' ? 'bottom' : 'top'}
              chosen={(emoji) => mineAlready(message, emoji)}
              onPick={(emoji) => {
                if (onReact) react(message.id, emoji, !mineAlready(message, emoji));
                setPicker(null);
              }}
              onCloseFocus={() => (picker.via === 'button' ? pickerFrom.current : null)}
              actions={picker.via === 'button' ? undefined : <>
                {canReply && <PickerAction icon="reply" label={t('actions.reply')} onSelect={() => { replyTo(); setPicker(null); }} />}
                {canTranslate && <PickerAction icon="translate" label={showingTranslation ? t('translate.original') : t('translate.action')} onSelect={() => { translate(message.id); setPicker(null); }} />}
                {plainText && <PickerAction icon="copy" label={t('actions.copy')} onSelect={() => { void navigator.clipboard?.writeText(plainText).then(() => toast.success(t('actions.copied'))).catch(() => undefined); setPicker(null); }} />}
              </>}
              {...(onReact ? {} : { reactionsOff: true })}
            />}
            </Popover>
          </li>
          </Fragment>;
        })}
      </ol>
    </section>)}
    {cardAtEnd && <div className="pt-1">{catchUpCard}</div>}
  </div>
  </>;
}
