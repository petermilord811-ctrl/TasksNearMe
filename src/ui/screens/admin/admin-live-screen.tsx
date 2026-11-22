'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Headset, LogIn, MessageSquareOff, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionResult, AdminCaseEventView, AdminLiveChatRow, AdminLiveHandlers, AdminLivePageData, ISODateTime } from '@/contracts';
import { routes } from '@/contracts/routes';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useRealtime } from '@/ui/lib/realtime';
import { cn } from '@/ui/lib/utils';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export interface AdminLiveScreenProps {
  data: AdminLivePageData;
  handlers: AdminLiveHandlers;
  now: ISODateTime;
}

/** How long the member's "typing…" stays after their last notice. */
const TYPING_SHOWN_MS = 6000;

function ChatRow({ row, now, current }: { row: AdminLiveChatRow; now: ISODateTime; current: boolean }) {
  const t = useTranslations('adminLive');
  const { formatRelative } = useFormat();
  return <li>
    <Link href={routes.admin.liveChat(row.caseId)} replace scroll={false} aria-current={current ? 'page' : undefined} className={cn('flex min-w-0 gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-ring', current && 'bg-brand-soft/60 hover:bg-brand-soft/70')}>
      <span className="relative shrink-0">
        <InitialsAvatar initials={row.member.initials} size="sm" />
        {row.waitingOnSupport && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-primary ring-2 ring-card" />}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-sm', row.waitingOnSupport ? 'font-bold' : 'font-semibold')}>{row.member.displayName}</span>
          <time dateTime={row.requestedAt} className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatRelative(row.joinedAt ?? row.requestedAt, now)}</time>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="shrink-0 rounded-full bg-secondary px-1.5 py-px font-medium text-secondary-foreground">{t(`topics.${row.topic}`)}</span>
          {row.member.username && <span className="truncate">@{row.member.username}</span>}
          {row.agent && <span className="truncate">· {t('with', { name: row.agent.displayName })}</span>}
        </span>
        {row.last && <span className="block truncate text-xs text-muted-foreground">{row.last.from === 'support' ? t('youOrSupport') : row.last.from === 'assistant' ? t('assistantSays') : ''}{row.last.body}</span>}
        {row.waitingOnSupport && <span className="sr-only">{t('unanswered')}</span>}
      </span>
    </Link>
  </li>;
}

function ChatList({ title, rows, now, currentId, empty }: { title: string; rows: AdminLiveChatRow[]; now: ISODateTime; currentId?: string; empty: string }) {
  const id = useId();
  return <section aria-labelledby={id} className="space-y-1">
    <h2 id={id} className="px-3 pt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title} <span className="tabular-nums">({rows.length})</span></h2>
    {rows.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">{empty}</p> : <ul className="space-y-0.5">{rows.map((row) => <ChatRow key={row.caseId} row={row} now={now} current={row.caseId === currentId} />)}</ul>}
  </section>;
}

function EventLine({ event, now }: { event: AdminCaseEventView; now: ISODateTime }) {
  const t = useTranslations('adminLive');
  const { formatTime, formatDateTime, formatRelative } = useFormat();
  const time = <time dateTime={event.at} title={formatRelative(event.at, now)} className="block text-xs text-muted-foreground tabular-nums"><span aria-hidden="true">{formatTime(event.at)}</span><span className="sr-only">{formatDateTime(event.at)}</span></time>;
  if (event.kind === 'message') {
    const fromMember = event.actor.kind === 'member' || event.actor.kind === 'contact';
    const assistant = event.actor.kind === 'assistant';
    const who = event.actor.kind === 'member' ? event.actor.person.displayName : event.actor.kind === 'staff' ? event.actor.staff.displayName : assistant ? t('assistant') : t('system');
    return <li className={cn('flex min-w-0 flex-col', fromMember || assistant ? 'items-start' : 'items-end')}>
      <article className={cn('min-w-0 max-w-[85%] space-y-1 rounded-[1.25rem] px-3.5 py-2.5 text-sm leading-6 [overflow-wrap:anywhere]', fromMember ? 'rounded-bl-md border border-foreground/[0.08] bg-background' : assistant ? 'rounded-bl-md bg-muted/70' : 'rounded-br-md bg-secondary text-secondary-foreground')}>
        <p className={cn('text-xs font-semibold', assistant ? 'text-muted-foreground' : fromMember ? 'text-foreground' : 'text-primary')}>{who}</p>
        <p className="whitespace-pre-line">{event.body}</p>
        {time}
      </article>
    </li>;
  }
  const actorName = event.actor.kind === 'staff' ? event.actor.staff.displayName : t('system');
  const label = event.kind === 'live'
    ? event.live === 'ended' ? t('events.liveEnded', { name: actorName }) : t('events.liveJoined', { name: actorName })
    : event.kind === 'note' ? t('events.note', { body: event.body ?? '' })
      : event.kind === 'status' ? t('events.status', { status: event.status ?? '' })
        : t(`events.${event.kind === 'assignment' ? 'assignment' : 'other'}`);
  return <li className="flex justify-center"><p className={cn('max-w-[90%] rounded-2xl px-3 py-1 text-center text-xs', event.kind === 'note' ? 'bg-badge-warning/40 text-foreground' : 'bg-foreground/[0.045] text-muted-foreground dark:bg-white/[0.06]')}>{label}</p></li>;
}

/**
 * Live chat for support staff (2026-11-22, owner: "let users wait until support is attending to chatting, and I will
 * support chatting (admins)"): members waiting for a person (oldest first, how long they've waited), your chats and
 * everyone else's; the open chat shows the member's whole conversation, the assistant's part included. Join to take it
 * (the member sees you join), write as it happens (they see you typing, you see them), and End chat when it's done; the
 * case goes on in its queue. The page reads again on every live notice for support (the staff layout's live stream).
 */
export function AdminLiveScreen({ data, handlers, now }: AdminLiveScreenProps) {
  const t = useTranslations('adminLive');
  const { formatRelative } = useFormat();
  const chat = data.selected;
  const [pending, setPending] = useState<'join' | 'end' | 'reply' | null>(null);
  const [result, setResult] = useState<ActionResult | undefined>();
  const [text, setText] = useState('');
  const [memberTyping, setMemberTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTyping = useRef(0);
  const logRef = useRef<HTMLOListElement>(null);
  const boxId = useId();
  // Another chat opened: its own empty box, and no message left from the last one (adjusted while rendering).
  const [shownCase, setShownCase] = useState(chat?.caseId);
  if (chat?.caseId !== shownCase) {
    setShownCase(chat?.caseId);
    setText('');
    setResult(undefined);
  }

  useRealtime('typing', (incoming) => {
    if (!chat || incoming.case !== chat.caseId) return false;
    setMemberTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setMemberTyping(false), TYPING_SHOWN_MS);
    return true;
  });
  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }, []);
  // A new message from them: they stopped typing (adjusted while rendering).
  const count = chat?.events.length ?? 0;
  const [countBefore, setCountBefore] = useState(count);
  if (count !== countBefore) {
    setCountBefore(count);
    if (memberTyping) setMemberTyping(false);
  }
  useLayoutEffect(() => {
    const log = logRef.current?.parentElement;
    if (log) log.scrollTop = log.scrollHeight;
  }, [count, memberTyping, chat?.caseId]);

  async function run(kind: 'join' | 'end' | 'reply', action: () => Promise<ActionResult>): Promise<boolean> {
    if (pending) return false;
    setPending(kind);
    setResult(undefined);
    let next: ActionResult;
    try {
      next = await action();
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    setPending(null);
    setResult(next);
    return next.ok;
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!chat || !text.trim()) return;
    if (await run('reply', () => handlers.onReply(chat.caseId, { body: text.trim() }))) setText('');
  }

  const failure = result && !result.ok
    ? result.code === 'not_allowed' ? t('errors.notAllowed') : result.code === 'expired' ? t('errors.ended') : result.code === 'rate_limited' ? t('errors.rateLimited') : result.fieldErrors?.body ? t('errors.body') : t('errors.unknown')
    : undefined;
  const none = data.waiting.length === 0 && data.mine.length === 0 && data.others.length === 0;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Headset aria-hidden="true" className="size-6 text-primary" />{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <p role="status" className="flex items-center gap-2 text-sm"><span aria-hidden="true" className={cn('size-2 rounded-full', data.agentsOnline > 0 ? 'bg-success' : 'bg-muted-foreground/50')} />{t('online', { count: data.agentsOnline })}</p>
    </header>
    {!data.canWork && <p className="rounded-2xl bg-muted px-4 py-3 text-sm">{t('readOnly')}</p>}
    <div className="lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start lg:gap-5">
      <aside aria-label={t('lists')} className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-2 shadow-card max-lg:mb-5 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto dark:border-white/[0.06]">
        <ChatList title={t('waiting')} rows={data.waiting} now={now} currentId={chat?.caseId} empty={t('noneWaiting')} />
        <ChatList title={t('mine')} rows={data.mine} now={now} currentId={chat?.caseId} empty={t('noneMine')} />
        {data.others.length > 0 && <ChatList title={t('others')} rows={data.others} now={now} currentId={chat?.caseId} empty="" />}
      </aside>
      {chat
        ? <section aria-label={t('chatWith', { name: chat.member.displayName })} className="flex h-[max(28rem,calc(100dvh-var(--app-header-offset,4.25rem)-12rem))] flex-col overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]">
          <header className="flex flex-wrap items-center gap-3 border-b border-foreground/[0.07] px-4 py-3 dark:border-white/[0.06]">
            <InitialsAvatar initials={chat.member.initials} size="sm" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{chat.member.displayName}{chat.member.username && <span className="ml-2 text-sm font-normal text-muted-foreground">@{chat.member.username}</span>}</h2>
              <p className="truncate text-xs text-muted-foreground">{t(`topics.${chat.topic}`)} · {chat.state === 'waiting' ? t('waitingSince', { time: formatRelative(chat.requestedAt, now) }) : chat.state === 'ended' ? t('stateEnded') : chat.isMine ? t('stateMine') : t('with', { name: chat.agent?.displayName ?? '' })}</p>
            </div>
            {chat.canJoin && <Button type="button" onClick={() => void run('join', () => handlers.onJoin(chat.caseId))} disabled={pending !== null} aria-busy={pending === 'join'} className="rounded-full">{pending === 'join' ? <Spinner aria-hidden="true" /> : <LogIn aria-hidden="true" />}{t('join')}</Button>}
            {chat.canEnd && <Button type="button" variant="outline" onClick={() => void run('end', () => handlers.onEnd(chat.caseId))} disabled={pending !== null} aria-busy={pending === 'end'} className="rounded-full">{pending === 'end' ? <Spinner aria-hidden="true" /> : <MessageSquareOff aria-hidden="true" />}{t('end')}</Button>}
            <Link href={routes.admin.case(chat.caseId)} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'rounded-full' })}>{t('openCase')}<ArrowUpRight aria-hidden="true" /></Link>
          </header>
          <div role="log" aria-label={t('log')} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <ol ref={logRef} className="space-y-3">
              {chat.events.map((event) => <EventLine key={event.id} event={event} now={now} />)}
              {memberTyping && <li className="flex"><p className="rounded-2xl bg-foreground/[0.045] px-3 py-1.5 text-sm text-muted-foreground dark:bg-white/[0.06]">{t('typing', { name: chat.member.displayName })}</p></li>}
            </ol>
          </div>
          {failure && <p role="alert" className="border-t border-foreground/[0.07] bg-destructive/[0.06] px-4 py-2 text-sm dark:border-white/[0.06]">{failure}</p>}
          {chat.canReply
            ? <form noValidate onSubmit={send} className="flex items-end gap-2 border-t border-foreground/[0.07] bg-card px-4 py-3 dark:border-white/[0.06]">
              <label htmlFor={boxId} className="sr-only">{t('reply')}</label>
              <Textarea id={boxId} rows={1} maxLength={2000} value={text} placeholder={t('replyPlaceholder', { name: chat.member.displayName })} onChange={(event) => {
                setText(event.target.value);
                if (handlers.onTyping && Date.now() - lastTyping.current > 2500) {
                  lastTyping.current = Date.now();
                  void handlers.onTyping(chat.caseId).catch(() => undefined);
                }
              }} onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                void send();
              }} className="max-h-40 min-h-11 flex-1 resize-none field-sizing-content" />
              <Button type="submit" disabled={pending !== null || !text.trim()} aria-busy={pending === 'reply'} className="h-11 rounded-full">{pending === 'reply' ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" />}{t('send')}</Button>
            </form>
            : <p className="border-t border-foreground/[0.07] bg-muted/60 px-4 py-3 text-center text-sm text-muted-foreground dark:border-white/[0.06]">{chat.state === 'waiting' ? t('joinToReply') : chat.state === 'ended' ? t('endedNote') : t('notYours')}</p>}
        </section>
        : <div className="flex min-h-80 flex-col items-center justify-center gap-2 rounded-[1.375rem] border border-dashed border-foreground/[0.12] p-8 text-center dark:border-white/[0.1]">
          <Headset aria-hidden="true" className="size-8 text-muted-foreground" />
          <p className="font-semibold">{none ? t('emptyTitle') : t('chooseTitle')}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{none ? t('emptyBody') : t('chooseBody')}</p>
        </div>}
    </div>
  </div>;
}
