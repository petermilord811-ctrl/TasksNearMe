'use client';

import Image from 'next/image';
import Link, { useLinkStatus } from 'next/link';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, Expand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionHandler, ISODateTime, MessageReaction, MessageView, PersonSummary, Photo } from '@/contracts';
import { MESSAGE_REACTIONS } from '@/contracts/messaging';
import { Reply } from 'lucide-react';
import { REACTION_EMOJI, useReply } from './reply-context';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { useRealtimeConnected } from '@/ui/lib/realtime';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';

function MessagePhoto({ photo, number, count, sender }: { photo: Photo; number: number; count: number; sender: string }) {
  const t = useTranslations('thread');
  const alt = photo.alt || t('photoAlt', { number, count, name: sender });
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" aria-label={t('openPhoto', { description: alt })} className="group w-full overflow-hidden rounded-lg border bg-card text-left text-foreground transition-colors hover:bg-accent">
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
  })}</>;
}

/** The link's label: while the earlier messages load, a spinner says so (a link's own state, so it's in it). */
function EarlierLabel() {
  const t = useTranslations('thread');
  const { pending } = useLinkStatus();
  return pending ? <><Spinner aria-hidden="true" />{t('loadingEarlier')}</> : <><ArrowUp aria-hidden="true" />{t('loadEarlier')}</>;
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

export function MessageLog({ messages, earlierHref, otherParty, now, seenMessageId, firstUnreadId, onReact, canReply = false, className }: { messages: MessageView[]; /** "Load earlier messages" (sweep MN11): this conversation from 100 messages earlier. */ earlierHref?: string; otherParty: PersonSummary; now: ISODateTime; seenMessageId?: string; firstUnreadId?: string; onReact?: ActionHandler<{ messageId: string; emoji: MessageReaction; on: boolean }>; /** Reply only where one can be sent: not in a closed or blocked conversation. */ canReply?: boolean; className?: string }) {
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
  const react = (messageId: string, emoji: MessageReaction, on: boolean) => {
    if (!onReact) return;
    const key = `${messageId}:${emoji}`;
    setPendingReactions((current) => ({ ...current, [key]: on }));
    void onReact({ messageId, emoji, on }).catch(() => undefined).finally(() => setPendingReactions((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    }));
  };
  const liveRef = useRef(live);
  useEffect(() => { liveRef.current = live; }, [live]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') router.refresh(); };
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

  const days = new Map<string, MessageView[]>();
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    const day = days.get(key) ?? [];
    day.push(message);
    days.set(key, day);
  }

  return <>
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
      {/* The same page with more above (replace: Back still leaves the conversation); it keeps its place (scroll). */}
      <Link href={earlierHref} replace scroll={false} prefetch={false} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'min-h-11 rounded-full sm:min-h-9' })}><EarlierLabel /></Link>
    </p>}
    {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>}
    {Array.from(days, ([day, entries]) => <section key={day} aria-label={formatDate(entries[0]!.createdAt, { withYear: true })} className="space-y-3">
      {/* A day separator, not a sticky chip: a sticky one covered photos while scrolling (UI-021). */}
      <h2 className="mx-auto w-fit rounded-full bg-foreground/[0.05] px-3 py-1 text-center text-xs font-semibold text-muted-foreground dark:bg-white/[0.07]"><time dateTime={day}>{formatDate(entries[0]!.createdAt, { withYear: true })}</time></h2>
      <ol className="space-y-2.5">
        {entries.map((message, index) => {
          const previous = entries[index - 1];
          // The same person, a moment later: no name again, closer to the one before.
          const grouped = Boolean(previous && previous.kind === 'text' && message.kind === 'text' && previous.sender === message.sender && Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUP_MS && message.id !== unreadFrom);
          const divider = message.id === unreadFrom
            ? <li><p className="flex items-center gap-3 py-1 text-xs font-semibold text-primary"><span aria-hidden="true" className="h-px flex-1 bg-primary/40" />{t('newMessages')}<span aria-hidden="true" className="h-px flex-1 bg-primary/40" /></p></li>
            : null;
          const sender = message.sender === 'me' ? t('you') : message.sender === 'them' ? otherParty.displayName : t('system');
          const isNotice = message.kind !== 'text';
          const mine = message.sender === 'me';
          const time = <time dateTime={message.createdAt} title={formatRelative(message.createdAt, now)} className={cn('text-xs tabular-nums', isNotice ? 'text-muted-foreground' : 'block', !isNotice && (mine ? 'text-right' : 'text-muted-foreground'))}>
            <span aria-hidden="true">{formatTime(message.createdAt)}</span><span className="sr-only">{formatDateTime(message.createdAt)}</span>
          </time>;
          // Updates ("On the way", an offer received…) are small notes between the bubbles.
          if (isNotice) return <Fragment key={message.id}>{divider}<li className="flex min-w-0 justify-center">
            <article className="inline-flex max-w-full flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 rounded-full bg-foreground/[0.045] px-3.5 py-1.5 text-center text-sm text-muted-foreground [overflow-wrap:anywhere] dark:bg-white/[0.06]">
              <p className="sr-only">{sender}</p>
              <p className="text-sm font-medium text-foreground/80"><MessageContent message={message} /></p>
              {time}
            </article>
          </li></Fragment>;
          return <Fragment key={message.id}>{divider}<li className={cn('group/msg flex min-w-0 flex-col', mine ? 'items-end' : 'items-start', grouped && '-mt-1.5')}>
            <article className={cn(
              'min-w-0 max-w-[86%] space-y-1.5 rounded-[1.25rem] px-3.5 py-2.5 [overflow-wrap:anywhere] sm:max-w-[75%] sm:px-4 sm:py-3',
              mine
                ? 'rounded-br-md bg-secondary text-secondary-foreground'
                : 'rounded-bl-md border border-foreground/[0.07] bg-background shadow-[0_1px_2px_rgb(23_18_14/0.05)] dark:border-white/[0.07]',
            )}>
              {/* Your own bubbles don't need your name on them; it's still read out. */}
              <p className={cn('text-xs font-semibold text-muted-foreground', (mine || grouped) && 'sr-only')}>{sender}</p>
              {message.replyTo && <blockquote className="border-l-2 border-primary/50 pl-2.5 text-[13px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                <span className="font-semibold">{message.replyTo.sender === 'me' ? t('you') : otherParty.displayName}: </span><MaskedText segments={message.replyTo.segments} />
              </blockquote>}
              <p className="text-[15px] leading-6"><MessageContent message={message} /></p>
              {message.attachments.length > 0 && <ul aria-label={t('photos')} className="grid max-w-96 grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                {message.attachments.map((photo, index) => <li key={photo.id} className="min-w-0"><MessagePhoto photo={photo} number={index + 1} count={message.attachments.length} sender={sender} /></li>)}
              </ul>}
              {time}
              {mine && message.id === seenMessageId && <p className="text-right text-xs font-medium text-muted-foreground">{t('seen')}</p>}
              {/* Reactions (completion plan 7.3): each emoji with its count; yours are marked and tap again to take back. */}
              {(() => {
                const shown = MESSAGE_REACTIONS.flatMap((emoji) => {
                  const given = message.reactions?.find((reaction) => reaction.emoji === emoji);
                  const pendingOn = pendingReactions[`${message.id}:${emoji}`];
                  const mineNow = pendingOn ?? given?.mine ?? false;
                  const count = (given?.count ?? 0) - (given?.mine ? 1 : 0) + (mineNow ? 1 : 0);
                  return count > 0 ? [{ emoji, count, mine: mineNow }] : [];
                });
                return shown.length > 0 && <ul aria-label={t('reactions.label')} className={cn('flex flex-wrap gap-1 pt-0.5', mine && 'justify-end')}>
                  {shown.map((reaction) => <li key={reaction.emoji}><button type="button" disabled={!onReact} aria-pressed={reaction.mine} onClick={() => react(message.id, reaction.emoji, !reaction.mine)} className={cn('inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-xs tabular-nums', reaction.mine ? 'border-primary/40 bg-brand-soft' : 'border-foreground/[0.1] bg-card')}>
                    <span aria-hidden="true">{REACTION_EMOJI[reaction.emoji]}</span><span className="sr-only">{t(`reactions.${reaction.emoji}`)}</span>{reaction.count}
                  </button></li>)}
                </ul>;
              })()}
            </article>
            {/* Reply and react: under the message, quiet until the pointer or the keyboard comes near on wide screens; none
                where nothing can be sent (a closed or blocked conversation has no composer to reply in). */}
            {(canReply || onReact) && <div role="group" aria-label={t('actions.label', { name: sender })} className="flex items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover/msg:opacity-100">
              {canReply && <button type="button" onClick={() => setReplyTo({ id: message.id, name: sender, text: message.segments.map((segment) => ('text' in segment ? segment.text : '•••')).join('').slice(0, 120) })} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                <Reply aria-hidden="true" className="size-3.5" />{t('actions.reply')}
              </button>}
              {onReact && MESSAGE_REACTIONS.map((emoji) => {
                const mineAlready = pendingReactions[`${message.id}:${emoji}`] ?? message.reactions?.find((reaction) => reaction.emoji === emoji)?.mine ?? false;
                return <button key={emoji} type="button" aria-pressed={mineAlready} aria-label={t(`reactions.${emoji}`)} onClick={() => react(message.id, emoji, !mineAlready)} className={cn('inline-flex size-8 items-center justify-center rounded-full text-sm hover:bg-foreground/[0.05] focus-visible:outline-2 focus-visible:outline-ring', mineAlready && 'bg-brand-soft')}>
                  <span aria-hidden="true">{REACTION_EMOJI[emoji]}</span>
                </button>;
              })}
            </div>}
          </li>
          </Fragment>;
        })}
      </ol>
    </section>)}
  </div>
  </>;
}
