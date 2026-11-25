'use client';

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type SVGProps } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Flag, ImageIcon, LockKeyhole, Reply, SmilePlus, Trash2 } from 'lucide-react';
import {
  MESSAGE_REACTIONS,
  routes,
  type ActionResult,
  type MessageReaction,
  type MessageSegment,
  type NeighborGroupHandlers,
  type NeighborGroupMessageView,
  type NeighborGroupQuote,
  type NeighborGroupView,
} from '@/contracts';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { MessageAttachments } from '@/ui/components/messaging/message-media';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { PickerAction, ReactionBurst, ReactionPicker, useBubbleGestures } from '@/ui/screens/messages/message-reactions';
import { REACTION_EMOJI, useReply } from '@/ui/screens/messages/reply-context';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Popover, PopoverAnchor } from '@/ui/primitives/popover';
import { Spinner } from '@/ui/primitives/spinner';

/** Messages from the same person within this long read as one run: their name and face once, closer together. */
const GROUP_MS = 5 * 60_000;
const failed: ActionResult = { ok: false, code: 'unknown' };

/** The words of some segments, for a reply's preview and Copy (masked details as dots, as they show). */
const plainOf = (segments: readonly MessageSegment[], masked = '•••') => segments.map((segment) => (segment.kind === 'text' ? segment.text : segment.kind === 'mention' ? `@${segment.name}` : masked)).join('');

/** One line for screen readers: a new message from someone else, or earlier ones above. */
type Announcement = { key: string; message: NeighborGroupMessageView };

function newAnnouncements(before: readonly NeighborGroupMessageView[], now: readonly NeighborGroupMessageView[]): Announcement[] {
  const lastId = before.at(-1)?.id;
  const last = lastId ? now.findIndex((message) => message.id === lastId) : -1;
  if (last < 0) return [];
  return now.slice(last + 1).filter((message) => !message.author.isYou && message.status === 'visible').map((message) => ({ key: message.id, message }));
}

/**
 * A building or street group's messages (2026-11-24, owner: "Group chat feature is not fully implemented yet. Chat
 * feature is still poor"): the same bubbles as a conversation (src/ui/screens/messages/message-log.tsx), with each
 * neighbor's face and name at the start of their run. Photos and GIFs in the bubble; a reply quotes the message it
 * answers; reactions under the bubble. On wide screens React, Reply and Delete or Report come up under the bubble while
 * the pointer or the keyboard is near; on touch screens a long press opens the picker with the same actions, and a
 * double tap sends a heart. "New messages" stays above what was new when the group opened.
 */
export function NeighborGroupLog({ view, handlers, unreadFrom, onChanged, onReport, className }: {
  view: NeighborGroupView;
  handlers: Pick<NeighborGroupHandlers, 'onReact' | 'onDeleteMessage'>;
  /** The "New messages" line goes above this message: the first that was new when the group opened. */
  unreadFrom?: string;
  /** Something here changed the group (a deletion): read it again. */
  onChanged: () => void;
  /** A report opens over the page: the sheet steps aside. */
  onReport: () => void;
  className?: string;
}) {
  const t = useTranslations('neighborGroups.group');
  const th = useTranslations('thread');
  const { formatDate, formatDateTime, formatTime, dayKey } = useFormat();
  const logRef = useRef<HTMLDivElement>(null);
  const { setReplyTo } = useReply();
  const messages = view.messages;

  // A reaction shows at once and stays until the group's own data says the same (as in a conversation), so it never
  // blinks off in between; a refusal or a failure takes it back at once, and a reload that never comes lets go.
  const [pendingReactions, setPendingReactions] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState<{ id: string; via: 'button' | 'touch' } | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const pickerFrom = useRef<HTMLElement | null>(null);
  const mineAlready = (message: NeighborGroupMessageView, emoji: MessageReaction) => pendingReactions[`${message.id}:${emoji}`] ?? message.reactions.find((reaction) => reaction.emoji === emoji)?.mine ?? false;
  const react = (messageId: string, emoji: MessageReaction, on: boolean) => {
    const key = `${messageId}:${emoji}`;
    if (on) {
      setBurst(key);
      window.setTimeout(() => setBurst((current) => (current === key ? null : current)), 700);
    }
    setPendingReactions((current) => ({ ...current, [key]: on }));
    const drop = () => setPendingReactions((current) => {
      if (current[key] !== on) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    void handlers.onReact({ messageId, emoji, on }).then((result) => {
      if (result.ok) onChanged();
      else {
        drop();
        toast.error(t('retry'));
      }
    }, drop);
    window.setTimeout(drop, 20_000);
  };
  const [reactionsSeenIn, setReactionsSeenIn] = useState(messages);
  if (reactionsSeenIn !== messages) {
    setReactionsSeenIn(messages);
    const settled = Object.entries(pendingReactions).filter(([key, on]) => {
      const cut = key.lastIndexOf(':');
      const message = messages.find((item) => item.id === key.slice(0, cut));
      return (message?.reactions.find((reaction) => reaction.emoji === key.slice(cut + 1))?.mine ?? false) === on;
    });
    if (settled.length > 0) {
      setPendingReactions((current) => {
        const next = { ...current };
        for (const [key] of settled) delete next[key];
        return next;
      });
    }
  }

  const gestures = useBubbleGestures({
    onLongPress: (id) => setPicker({ id, via: 'touch' }),
    onDoubleTap: (id) => {
      const message = messages.find((item) => item.id === id);
      if (message?.canReact) react(id, 'heart', !mineAlready(message, 'heart'));
    },
  });

  // Delete your own: one confirmation for the log.
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    let result: ActionResult;
    try { result = await handlers.onDeleteMessage({ messageId: deleting }); } catch { result = failed; }
    setDeletePending(false);
    if (result.ok) {
      setDeleting(null);
      onChanged();
    } else toast.error(t('retry'));
  };

  // What a screen reader hears: the log isn't a live region; new messages from others are read out as they come.
  const [heard, setHeard] = useState<{ messages: readonly NeighborGroupMessageView[]; announcements: Announcement[] }>({ messages, announcements: [] });
  if (heard.messages !== messages) {
    const next = newAnnouncements(heard.messages, messages);
    setHeard({ messages, announcements: next.length > 0 ? [...heard.announcements, ...next].slice(-5) : heard.announcements });
  }

  // Opening: at "New messages" when there's something new, else at the newest. Then a reader at the bottom follows new
  // messages (and always their own, just sent); one reading back up stays where they are.
  const shown = useRef<{ opened: boolean; lastId?: string; height: number }>({ opened: false, height: 0 });
  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const before = shown.current;
    const last = messages.at(-1);
    if (!before.opened) {
      const line = log.querySelector<HTMLElement>('[data-unread-line]');
      log.scrollTop = line ? log.scrollTop + line.getBoundingClientRect().top - log.getBoundingClientRect().top - 12 : log.scrollHeight;
    } else if (last?.id !== before.lastId) {
      const wasAtBottom = before.height - log.scrollTop - log.clientHeight <= 40;
      if (wasAtBottom || last?.author.isYou) log.scrollTop = log.scrollHeight;
    }
    shown.current = { opened: true, lastId: last?.id, height: log.scrollHeight };
  }, [messages]);

  // The message box grows under the log (photos, a reply, more lines) and the log gets shorter: a reader at the bottom
  // stays there, the newest message in full view.
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

  const days = new Map<string, NeighborGroupMessageView[]>();
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    days.set(key, [...(days.get(key) ?? []), message]);
  }
  const nameOf = (message: NeighborGroupMessageView) => (message.author.isYou ? t('you') : message.author.displayName);

  return <>
    <div aria-live="polite" aria-relevant="additions" className="sr-only">
      {heard.announcements.map((item) => <p key={item.key}>{item.message.author.displayName}: {item.message.segments.length > 0 ? plainOf(item.message.segments, t('hidden')) : t(item.message.attachments.every((photo) => photo.animated) ? 'gif' : 'photo')}</p>)}
    </div>
    <div ref={logRef} role="log" aria-label={t('log', { name: view.group.name })} aria-live="off" tabIndex={0}
      onScroll={(event) => { shown.current.height = event.currentTarget.scrollHeight; }}
      className={cn('space-y-5 overflow-y-auto overscroll-contain px-3 py-4 [overflow-anchor:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-4', className)}>
      <p className="flex items-start gap-2 rounded-2xl bg-secondary/70 px-3.5 py-2 text-[13px] leading-5 text-secondary-foreground"><LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /><span>{t('masked')}</span></p>
      {view.hasEarlier && <p className="text-center text-xs text-muted-foreground">{t('earlier')}</p>}
      {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>}
      {Array.from(days, ([day, entries]) => <section key={day} aria-label={formatDate(entries[0]!.createdAt, { withYear: true })} className="space-y-3">
        <h3 className="mx-auto w-fit rounded-full bg-foreground/[0.05] px-3 py-1 text-center text-xs font-semibold text-muted-foreground dark:bg-white/[0.07]"><time dateTime={day}>{formatDate(entries[0]!.createdAt, { withYear: true })}</time></h3>
        <ol className="space-y-2.5">
          {entries.map((message, index) => {
            const previous = entries[index - 1];
            const mine = message.author.isYou;
            const visible = message.status === 'visible';
            // The same person, a moment later: no name or face again, closer to the one before.
            const grouped = Boolean(previous && previous.author.userId === message.author.userId && Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUP_MS && message.id !== unreadFrom);
            const sender = nameOf(message);
            const plainText = plainOf(message.segments, '');
            const pills = visible ? MESSAGE_REACTIONS.flatMap((emoji) => {
              const given = message.reactions.find((reaction) => reaction.emoji === emoji);
              const mineNow = mineAlready(message, emoji);
              const count = (given?.count ?? 0) - (given?.mine ? 1 : 0) + (mineNow ? 1 : 0);
              return count > 0 ? [{ emoji, count, mine: mineNow }] : [];
            }) : [];
            const replyTo = () => setReplyTo({ id: message.id, name: sender, text: plainOf(message.segments).slice(0, 120) || t(message.attachments.every((photo) => photo.animated) ? 'gif' : 'photo') });
            const hasActions = message.canReact || message.canReply || message.canDelete || message.canReport;
            const reportLink = message.canReport ? routes.app.report('group_message', message.id) : undefined;
            // Your own bubble's time in its own text color, as in a conversation (a lighter one failed contrast there).
            const time = <time dateTime={message.createdAt} title={formatDateTime(message.createdAt)} className={cn('text-xs tabular-nums', !mine && 'text-muted-foreground')}>
              <span aria-hidden="true">{formatTime(message.createdAt)}</span><span className="sr-only">{formatDateTime(message.createdAt)}</span>
            </time>;
            return <Fragment key={message.id}>
              {message.id === unreadFrom && <li data-unread-line=""><p className="flex items-center gap-3 py-1 text-xs font-semibold text-primary"><span aria-hidden="true" className="h-px flex-1 bg-primary/40" />{th('newMessages')}<span aria-hidden="true" className="h-px flex-1 bg-primary/40" /></p></li>}
              {/* Their face beside their name, at the top of their run: a tall bubble (photos) keeps both in view. */}
              <li data-message-id={message.id} className={cn('group/msg flex min-w-0 items-start gap-2', mine && 'flex-row-reverse', grouped && '-mt-1.5')}>
                {!mine && (grouped
                  ? <span aria-hidden="true" className="w-8 shrink-0" />
                  : <span aria-hidden="true" className="shrink-0"><InitialsAvatar initials={message.author.initials} size="sm" {...(message.author.photo ? { photo: message.author.photo } : {})} /></span>)}
                <Popover open={picker?.id === message.id} onOpenChange={(open) => { if (!open) setPicker(null); }}>
                  <PopoverAnchor asChild>
                    <article {...(visible ? gestures(message.id) : {})} className={cn(
                      'relative min-w-0 max-w-[82%] space-y-1.5 rounded-[1.25rem] px-3.5 py-2.5 [overflow-wrap:anywhere] [-webkit-touch-callout:none] sm:max-w-[75%] sm:px-4',
                      !visible
                        ? 'border border-dashed border-foreground/15 bg-transparent text-muted-foreground dark:border-white/15'
                        : mine
                          ? 'rounded-br-md bg-secondary text-secondary-foreground'
                          : 'rounded-bl-md border border-foreground/[0.07] bg-background shadow-[0_1px_2px_rgb(23_18_14/0.05)] dark:border-white/[0.07]',
                    )}>
                      {/* Your own bubbles don't need your name; others' carry it at the start of their run. Always read out. */}
                      <p className={cn('text-xs font-semibold text-muted-foreground', (mine || grouped) && 'sr-only')}>
                        {sender}{!mine && message.author.areaName ? <span className="font-normal"> · {message.author.areaName}</span> : null}
                      </p>
                      {visible && message.replyTo && <GroupQuote quote={message.replyTo} />}
                      {visible
                        ? message.segments.length > 0 && <p className="text-[15px] leading-6"><MaskedText segments={message.segments} links={false} always /></p>
                        : <p className="text-sm italic">{t(message.status)}</p>}
                      {visible && <MessageAttachments attachments={message.attachments} sender={sender} className={message.segments.length > 0 || message.replyTo ? 'pt-1' : undefined} />}
                      <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', mine && 'justify-end')}>
                        {message.reportedByYou && <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">{t('reported')}</Badge>}
                        {time}
                      </p>
                      {pills.length > 0 && <ul aria-label={th('reactions.label')} className={cn('flex flex-wrap gap-1 pt-0.5', mine && 'justify-end')}>
                        {pills.map((reaction) => {
                          const key = `${message.id}:${reaction.emoji}`;
                          return <li key={reaction.emoji} className="relative">
                            <button type="button" disabled={!message.canReact} aria-pressed={reaction.mine} onClick={() => react(message.id, reaction.emoji, !reaction.mine)} className={cn('inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors disabled:cursor-default', reaction.mine ? 'border-primary/40 bg-brand-soft' : 'border-foreground/[0.1] bg-card hover:bg-accent disabled:hover:bg-card')}>
                              <span aria-hidden="true" className={cn('inline-block text-sm leading-none', burst === key && 'reaction-pop')}>{REACTION_EMOJI[reaction.emoji]}</span><span className="sr-only">{th(`reactions.${reaction.emoji}`)}</span>{reaction.count}
                            </button>
                            {burst === key && <ReactionBurst />}
                          </li>;
                        })}
                      </ul>}
                      {/* Wide screens: the actions come up under the bubble, on its outer side, while the pointer or the
                          keyboard is near (as in a conversation); touch screens use a long press. Hidden, they take no clicks. */}
                      {hasActions && <div role="group" aria-label={th('actions.label', { name: sender })} className={cn('pointer-events-none absolute top-[calc(100%-0.5rem)] z-10 flex items-center gap-0.5 rounded-full border border-foreground/[0.08] bg-card p-0.5 opacity-0 shadow-[0_6px_18px_-8px_rgb(40_20_5/0.45)] transition-opacity group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 [@media(pointer:coarse)]:hidden dark:border-white/[0.1]', mine ? 'right-2' : 'left-2', picker?.id === message.id && 'invisible')}>
                        {message.canReact && <button type="button" aria-label={th('reactions.react')} title={th('reactions.react')} aria-haspopup="dialog" aria-expanded={picker?.id === message.id} onClick={(event) => { pickerFrom.current = event.currentTarget; setPicker({ id: message.id, via: 'button' }); }} className={rowButton}>
                          <SmilePlus aria-hidden="true" className="size-4" />
                        </button>}
                        {message.canReply && <button type="button" onClick={replyTo} aria-label={th('actions.reply')} title={th('actions.reply')} className={rowButton}><Reply aria-hidden="true" className="size-4" /></button>}
                        {message.canDelete && <button type="button" onClick={() => setDeleting(message.id)} aria-label={t('deleteLabel')} title={t('delete')} className={cn(rowButton, 'hover:text-destructive')}><Trash2 aria-hidden="true" className="size-4" /></button>}
                        {reportLink && <Link href={reportLink} onClick={onReport} aria-label={t('reportLabel', { name: message.author.displayName })} title={t('report')} className={cn(rowButton, 'hover:text-destructive')}><Flag aria-hidden="true" className="size-4" /></Link>}
                      </div>}
                    </article>
                  </PopoverAnchor>
                  {picker?.id === message.id && <ReactionPicker
                    label={mine ? th('reactions.pickerMine') : th('reactions.picker', { name: sender })}
                    side={picker.via === 'button' ? 'bottom' : 'top'}
                    chosen={(emoji) => mineAlready(message, emoji)}
                    onPick={(emoji) => {
                      if (message.canReact) react(message.id, emoji, !mineAlready(message, emoji));
                      setPicker(null);
                    }}
                    onCloseFocus={() => (picker.via === 'button' ? pickerFrom.current : null)}
                    actions={picker.via === 'button' ? undefined : <>
                      {message.canReply && <PickerAction icon="reply" label={th('actions.reply')} onSelect={() => { replyTo(); setPicker(null); }} />}
                      {plainText && <PickerAction icon="copy" label={th('actions.copy')} onSelect={() => { void navigator.clipboard?.writeText(plainText).then(() => toast.success(th('actions.copied'))).catch(() => undefined); setPicker(null); }} />}
                      {message.canDelete && <GroupPickerAction icon={Trash2} label={t('delete')} onSelect={() => { setPicker(null); setDeleting(message.id); }} />}
                      {reportLink && <Link href={reportLink} onClick={() => { setPicker(null); onReport(); }} aria-label={t('reportLabel', { name: message.author.displayName })} className={pickerActionClass}><Flag aria-hidden="true" className="size-4" />{t('report')}</Link>}
                    </>}
                    {...(message.canReact ? {} : { reactionsOff: true })}
                  />}
                </Popover>
              </li>
            </Fragment>;
          })}
        </ol>
      </section>)}
      {view.blockedHidden > 0 && <p className="text-center text-xs text-muted-foreground">{t('blockedHidden', { count: view.blockedHidden })}</p>}
    </div>
    <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open && !deletePending) setDeleting(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletePending}>{t('cancel')}</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={deletePending} aria-busy={deletePending} onClick={() => void confirmDelete()}>{deletePending && <Spinner aria-hidden="true" />}{t(deletePending ? 'deleting' : 'deleteConfirm')}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

const rowButton = 'grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring';
const pickerActionClass = 'inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-ring';

/** One of the picker's group actions on touch screens (Delete), styled as the picker's own. */
function GroupPickerAction({ icon: Icon, label, onSelect }: { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; onSelect(): void }) {
  return <button type="button" onClick={onSelect} className={pickerActionClass}><Icon aria-hidden="true" className="size-4" />{label}</button>;
}

/** The message a reply answers, quoted above it: who wrote it and its first words, or why it can't show. */
function GroupQuote({ quote }: { quote: NeighborGroupQuote }) {
  const t = useTranslations('neighborGroups.group');
  const visible = quote.status === 'visible';
  // At most three lines: a long message quoted in full pushed the reply itself down (2026-11-24 chat audit).
  return <blockquote className="line-clamp-3 border-l-2 border-primary/50 pl-2.5 text-[13px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
    {quote.author && <span className="font-semibold">{quote.author.isYou ? t('you') : quote.author.displayName}: </span>}
    {visible
      ? <>
        {quote.segments.length > 0 && <MaskedText segments={quote.segments} links={false} always />}
        {quote.media && <span className={cn('inline-flex items-center gap-1 align-[-2px]', quote.segments.length > 0 && 'ml-1.5')}><ImageIcon aria-hidden="true" className="size-3.5" />{t(quote.media)}</span>}
      </>
      : <span className="italic">{t(quote.status === 'hidden' ? 'quoteHidden' : quote.status)}</span>}
  </blockquote>;
}
