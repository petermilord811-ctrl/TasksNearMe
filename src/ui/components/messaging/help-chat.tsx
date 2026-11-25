'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, CircleAlert, Headset, LifeBuoy, RotateCcw, Send, ShieldAlert, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ASSISTANT_QUESTION_MAX,
  type ActionResult,
  type AssistantTranscript,
  type AssistantTurn,
  type CaseEventView,
  type HelpChatData,
  type HelpChatHandlers,
  type ISODateTime,
  type LiveChatHours,
  type Mode,
  type SupportTopic,
} from '@/contracts';
import { routes } from '@/contracts/routes';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { LiveChatHoursLine } from '@/ui/components/support/live-hours';
import { SupportRatingCard } from '@/ui/components/support/support-rating';
import { EmailTranscriptButton } from '@/ui/components/support/transcript-button';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useRealtime } from '@/ui/lib/realtime';
import { cn } from '@/ui/lib/utils';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { HelpAvatar } from './help-row';

export interface HelpChatProps {
  data: HelpChatData;
  transcript: AssistantTranscript;
  handlers: HelpChatHandlers;
  now: ISODateTime;
  /** In the chat window (tighter), or on its own page. */
  variant?: 'window' | 'page';
}

const SUGGESTIONS: Record<Mode, readonly string[]> = {
  poster: ['charged', 'cancel', 'address', 'problem'],
  helper: ['paid', 'verified', 'price', 'problem'],
};

/** How long "typing…" from support stays after the last notice (they ping every 2.5 s while typing). */
const TYPING_SHOWN_MS = 6000;

const bubble = 'min-w-0 max-w-[88%] space-y-1.5 rounded-[1.25rem] px-3.5 py-2.5 text-[15px] leading-6 [overflow-wrap:anywhere]';
const theirs = 'rounded-bl-md border border-foreground/[0.07] bg-background shadow-[0_1px_2px_rgb(23_18_14/0.05)] dark:border-white/[0.07]';
const mine = 'rounded-br-md bg-secondary text-secondary-foreground';
const notice = 'rounded-full bg-foreground/[0.045] px-3 py-1 text-center text-xs font-medium text-muted-foreground dark:bg-white/[0.06]';

/** An answer's text: paragraphs, and lines that start with "- " as a list. Plain text only (never HTML). */
function AnswerText({ text }: { text: string }) {
  return <div className="space-y-2">
    {text.split(/\n{2,}/).map((block, index) => {
      const lines = block.split('\n').filter((line) => line.trim());
      const listed = lines.length > 0 && lines.every((line) => /^\s*-\s+/.test(line));
      return listed
        ? <ul key={index} className="list-disc space-y-1 pl-5">{lines.map((line, item) => <li key={item}>{line.replace(/^\s*-\s+/, '')}</li>)}</ul>
        : <p key={index} className="whitespace-pre-line">{block}</p>;
    })}
  </div>;
}

function Sender({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-muted-foreground">{children}</p>;
}

/** The assistant's turn: the answer, the articles it used, and on the newest answer what it suggests next. */
function AnswerBubble({ turn, latest, connecting, onTalk, hours }: { turn: AssistantTurn; latest: boolean; connecting: boolean; onTalk(): void; hours: LiveChatHours }) {
  const t = useTranslations('chat.help');
  const { answer } = turn;
  return <li className="flex min-w-0 flex-col items-start gap-2">
    <article className={cn(bubble, theirs)}>
      <Sender>{t('assistant')}</Sender>
      <AnswerText text={answer.text} />
      {answer.sources.length > 0 && <div className="space-y-1 pt-1">
        <p className="text-xs font-medium text-muted-foreground">{t('sources')}</p>
        <ul className="flex flex-wrap gap-1.5">
          {answer.sources.map((source) => <li key={source.slug}><Link href={routes.help(source.slug)} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-foreground/[0.1] bg-card px-2.5 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring dark:border-white/[0.1]"><BookOpen aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{source.title}</span></Link></li>)}
        </ul>
      </div>}
    </article>
    {latest && (answer.handoff === 'suggest' || answer.handoff === 'urgent') && <HandoffCard urgent={answer.handoff === 'urgent'} connecting={connecting} onTalk={onTalk} hours={hours} />}
  </li>;
}

function HandoffCard({ urgent, connecting, onTalk, hours }: { urgent: boolean; connecting: boolean; onTalk(): void; hours: LiveChatHours }) {
  const t = useTranslations('chat.help');
  return <div role={urgent ? 'alert' : undefined} className={cn('w-full max-w-[88%] space-y-2 rounded-2xl border px-3.5 py-3 text-sm', urgent ? 'border-destructive/40 bg-destructive/[0.06]' : 'border-primary/25 bg-brand-soft/50')}>
    <p className="flex items-start gap-2 font-semibold">{urgent ? <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" /> : <LifeBuoy aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />}{urgent ? t('urgentTitle') : t('suggestPerson')}</p>
    {urgent && <p className="text-muted-foreground">{t('urgentBody')}</p>}
    <Button type="button" size="sm" variant={urgent ? 'destructive' : 'default'} onClick={onTalk} disabled={connecting} aria-busy={connecting} className="rounded-full">{connecting ? <Spinner aria-hidden="true" /> : <UserRound aria-hidden="true" />}{connecting ? t('live.connecting') : t('talkToPerson')}</Button>
    {/* When a person answers live chats (2026-11-23). */}
    <LiveChatHoursLine hours={hours} />
  </div>;
}

function CaseEvent({ event, now }: { event: CaseEventView; now: ISODateTime }) {
  const t = useTranslations('chat.help');
  const { formatTime, formatDateTime, formatRelative } = useFormat();
  if (event.kind === 'status') return <li className="flex justify-center"><p className={notice}>{t('case.status', { status: t(`statuses.${event.status ?? 'open'}`) })}</p></li>;
  // Live chat (2026-11-22): someone from support joined (with their photo or initial since 2026-11-23), or the chat ended.
  if (event.kind === 'live') {
    const joined = event.live !== 'ended';
    return <li className="flex justify-center"><p className={cn(notice, joined && 'inline-flex items-center gap-1.5 bg-brand-soft/70 text-foreground')}>
      {joined && event.agent && <InitialsAvatar initials={event.agent.initials} {...(event.agent.photo ? { photo: event.agent.photo } : {})} size="xs" />}
      {joined ? t('live.joined', { name: event.agentName ?? t('support') }) : t('live.endedEvent')}
    </p></li>;
  }
  const own = event.from === 'me';
  // The person from support on a live chat writes as themselves: first name and photo (2026-11-23).
  const agent = event.from === 'support' ? event.agent : undefined;
  const sender = own ? t('you') : event.from === 'assistant' ? t('assistant') : event.from === 'support' ? agent?.name ?? t('support') : t('update');
  return <li className={cn('flex min-w-0', own ? 'flex-col items-end' : 'items-end gap-2')}>
    {agent && <InitialsAvatar initials={agent.initials} {...(agent.photo ? { photo: agent.photo } : {})} size="sm" />}
    <article className={cn(bubble, own ? mine : theirs, event.from === 'assistant' && 'bg-muted/60')}>
      <p className={cn('text-xs font-semibold', own ? 'sr-only' : event.from === 'support' ? 'text-primary' : 'text-muted-foreground')}>{sender}</p>
      {event.from === 'assistant' ? <AnswerText text={event.body ?? ''} /> : <p className="whitespace-pre-line">{event.body}</p>}
      <time dateTime={event.at} title={formatRelative(event.at, now)} className={cn('block text-xs tabular-nums', own ? 'text-right' : 'text-muted-foreground')}><span aria-hidden="true">{formatTime(event.at)}</span><span className="sr-only">{formatDateTime(event.at)}</span></time>
    </article>
  </li>;
}

function TypingBubble({ label }: { label: string }) {
  return <li className="flex min-w-0 flex-col items-start"><p className={cn(bubble, theirs, 'flex items-center gap-2 text-sm text-muted-foreground')}>
    <span aria-hidden="true" className="inline-flex gap-0.5">{[0, 1, 2].map((dot) => <span key={dot} className="size-1.5 animate-bounce rounded-full bg-current motion-reduce:animate-none" style={{ animationDelay: `${dot * 150}ms` }} />)}</span>{label}
  </p></li>;
}

/** The box at the bottom: a question for the assistant, or a message to support. Enter sends on wide screens. */
function Composer({ label, placeholder, max, sendLabel, sendingLabel, pending, onSend, onTyping, disabled = false, below }: {
  label: string;
  placeholder: string;
  max: number;
  sendLabel: string;
  sendingLabel: string;
  pending: boolean;
  onSend(text: string): Promise<boolean> | boolean;
  onTyping?(): void;
  disabled?: boolean;
  below?: ReactNode;
}) {
  const t = useTranslations('chat.help');
  const id = useId();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const empty = text.trim().length === 0;
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (empty || pending || disabled) return;
    const keepFocus = document.activeElement === ref.current;
    const sent = await onSend(text.trim());
    if (sent) setText('');
    if (keepFocus) ref.current?.focus();
  }
  return <form noValidate onSubmit={send} className="space-y-1.5 border-t border-foreground/[0.07] bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/[0.06]">
    <label htmlFor={`${id}-text`} className="sr-only">{label}</label>
    <div className="flex items-end gap-2">
      <Textarea ref={ref} id={`${id}-text`} rows={1} maxLength={max} value={text} disabled={disabled} placeholder={placeholder} aria-describedby={`${id}-count`} onChange={(event) => {
        setText(event.target.value);
        onTyping?.();
      }} onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || !window.matchMedia('(min-width: 1024px)').matches) return;
        event.preventDefault();
        void send();
      }} className="max-h-32 min-h-11 flex-1 resize-none field-sizing-content" />
      <Button type="submit" size="icon" disabled={empty || pending || disabled} aria-busy={pending} onMouseDown={(event) => event.preventDefault()} aria-label={pending ? sendingLabel : sendLabel} className="size-11 shrink-0 rounded-full">{pending ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" className="size-4" />}</Button>
    </div>
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
      {below}
      <span id={`${id}-count`} className="ml-auto text-xs text-muted-foreground tabular-nums">{t('counter', { count: text.length, maximum: max })}</span>
    </div>
  </form>;
}

/**
 * The Help conversation (2026-11-22), in the chat window and on its own page: the AI assistant answers from the help
 * center (each answer with the articles it used). "Talk to a person" is always one tap away, and asking in words ("I
 * want a live agent") does the same: the chat goes to support as a live chat, and this shows it: their place in line
 * (or that no one is online, and they'll get a reply here), the person from support joining, both sides typing, and the
 * chat ending (the case goes on as messages). Everything comes in through `data` and `transcript`; the app does the
 * asking and the sending.
 */
export function HelpChat({ data, transcript, handlers, now, variant = 'window' }: HelpChatProps) {
  const t = useTranslations('chat.help');
  const { formatDateTime, zoneName } = useFormat();
  const [assistantOverCase, setAssistantOverCase] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | undefined>();
  const [replyPending, setReplyPending] = useState(false);
  const [replyResult, setReplyResult] = useState<ActionResult | undefined>();
  const [supportTyping, setSupportTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const open = data.case;
  const live = open?.live;
  const mode = open && !assistantOverCase ? 'case' : 'assistant';
  const turns = transcript.turns;
  const name = data.viewer.firstName;
  const lastTurn = turns.at(-1);

  // The newest line stays in view: a question, its answer, support's reply, the line about the queue.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [mode, turns.length, transcript.pending, transcript.error, open?.events.length, live?.state, supportTyping, connecting]);

  // "Typing…" from the person on the chat (a live notice for this case), for a few seconds after each.
  useRealtime('typing', (incoming) => {
    if (!open || incoming.case !== open.id) return false;
    setSupportTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setSupportTyping(false), TYPING_SHOWN_MS);
    return true;
  });
  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }, []);
  // Their message arrived: they stopped typing (adjusted while rendering).
  const supportCount = open?.events.filter((event) => event.from === 'support').length ?? 0;
  const [supportCountBefore, setSupportCountBefore] = useState(supportCount);
  if (supportCount !== supportCountBefore) {
    setSupportCountBefore(supportCount);
    if (supportTyping) setSupportTyping(false);
  }

  async function connect() {
    if (connecting) return;
    setConnectError(undefined);
    setAssistantOverCase(false);
    // A case is open: ask for a live chat on it, or (it has one already) just go back to it.
    if (open && (!open.canRequestLive || !handlers.onRequestLive)) return;
    setConnecting(true);
    const urgent = turns.some((turn) => turn.answer.handoff === 'urgent');
    const topic: SupportTopic = urgent ? 'safety' : lastTurn?.answer.topic ?? 'other';
    const details = lastTurn?.question ?? transcript.error?.question ?? t('handoff.defaultDetails');
    let result: ActionResult;
    try {
      result = open && handlers.onRequestLive ? await handlers.onRequestLive() : await handlers.onHandOff({ topic, details });
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    setConnecting(false);
    if (!result.ok) setConnectError(result.code === 'rate_limited' && result.retryAt ? t('handoff.errors.rate_limited', { time: `${formatDateTime(result.retryAt)} ${zoneName}` }) : t('handoff.errors.unknown'));
  }

  // They asked for a person in words: the newest answer says "live", and the chat connects them once.
  const connectRef = useRef(connect);
  useEffect(() => {
    connectRef.current = connect;
  });
  const autoKey = lastTurn?.answer.handoff === 'live' && !open ? lastTurn.id : undefined;
  const connected = useRef(new Set<string>());
  useEffect(() => {
    if (!autoKey || connected.current.has(autoKey)) return;
    connected.current.add(autoKey);
    const timer = setTimeout(() => void connectRef.current(), 0);
    return () => clearTimeout(timer);
  }, [autoKey]);

  async function reply(body: string): Promise<boolean> {
    setReplyPending(true);
    setReplyResult(undefined);
    let result: ActionResult;
    try {
      result = await handlers.onReply({ body });
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    setReplyPending(false);
    setReplyResult(result);
    return result.ok;
  }

  const replyError = replyResult && !replyResult.ok
    ? replyResult.fieldErrors?.body?.[0] === 'too_long' ? t('case.errors.too_long')
      : replyResult.fieldErrors?.body ? t('case.errors.required')
        : replyResult.code === 'not_allowed' ? t('case.errors.not_allowed')
          : replyResult.code === 'rate_limited' && replyResult.retryAt ? t('case.errors.rate_limited', { time: `${formatDateTime(replyResult.retryAt)} ${zoneName}` })
            : t('case.errors.unknown')
    : undefined;
  const askError = transcript.error
    ? transcript.error.code === 'rate_limited'
      ? transcript.error.retryAt ? t('errors.rate_limited', { time: `${formatDateTime(transcript.error.retryAt)} ${zoneName}` }) : t('errors.rate_limited_soon')
      : t(`errors.${transcript.error.code}`)
    : undefined;
  const canRetry = transcript.error && (transcript.error.code === 'unavailable' || transcript.error.code === 'unknown');
  const supportReplied = supportCount > 0;
  const agent = live?.state === 'joined' ? live.agentName : undefined;
  // Who's on the live chat, with their photo or initial (2026-11-23).
  const agentView = live?.state === 'joined' ? live.agent : undefined;
  const announcement = connecting ? t('live.connecting') : transcript.pending ? t('thinking') : lastTurn ? `${t('assistant')}: ${lastTurn.answer.text}` : '';
  const talkButton = (className?: string) => <Button type="button" variant="ghost" size="sm" onClick={() => void connect()} disabled={connecting} aria-busy={connecting} className={cn('rounded-full', className)}>{connecting ? <Spinner aria-hidden="true" /> : <UserRound aria-hidden="true" />}{connecting ? t('live.connecting') : t('talkToPerson')}</Button>;
  // After the live chat, or a case that finished lately: how was the help, and a copy by email (2026-11-23).
  const { onRate, onEmailTranscript } = handlers;
  // "How was your chat with Riley?": the person who joined the live chat that ended.
  const ratedAgent = [...(open?.events ?? [])].reverse().find((event) => event.kind === 'live' && event.live === 'joined')?.agentName;
  const caseRating = mode === 'case' && open?.rating && onRate ? <li><SupportRatingCard key={open.id} rating={open.rating} variant="chat" {...(ratedAgent ? { agentName: ratedAgent } : {})} onRate={(input) => onRate(open.id, input)} /></li> : null;
  const caseTranscript = mode === 'case' && open?.transcript && onEmailTranscript ? <li className="flex justify-center"><EmailTranscriptButton key={open.id} transcript={open.transcript} compact onEmail={() => onEmailTranscript(open.id)} /></li> : null;

  return <div className="flex min-h-0 flex-1 flex-col">
    {/* Who this is with, and what it is now: the assistant, the support team, or the person on the live chat. */}
    <header className={cn('flex min-w-0 items-center gap-2.5 border-b border-foreground/[0.07] dark:border-white/[0.06]', variant === 'page' ? 'px-4 py-3' : 'px-3 py-2.5')}>
      {mode === 'case' && agentView ? <InitialsAvatar initials={agentView.initials} {...(agentView.photo ? { photo: agentView.photo } : {})} size="sm" /> : <HelpAvatar size="sm" />}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-semibold">{t('title')}</h3>
        <p className="truncate text-xs text-muted-foreground">{mode === 'case' ? (agent ? t('live.with', { name: agent }) : t('subtitleSupport')) : t('subtitleAssistant')}</p>
      </div>
      {mode === 'case' && open && <Link href={routes.app.supportCase(open.id)} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'shrink-0 rounded-full text-primary' })}>{t('case.openCase')}<ArrowUpRight aria-hidden="true" /></Link>}
      {mode === 'assistant' && turns.length > 0 && !transcript.pending && <Button type="button" variant="ghost" size="sm" onClick={handlers.onStartOver} className="shrink-0 rounded-full"><RotateCcw aria-hidden="true" />{t('startOver')}</Button>}
    </header>

    <div aria-live="polite" className="sr-only">{announcement}</div>
    <div ref={logRef} role="log" aria-label={t('log')} aria-live="off" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 [overflow-anchor:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
      {mode === 'assistant' && open && <p className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/25 bg-brand-soft/50 px-3.5 py-2 text-sm">
        <span>{t('case.backToCase')}</span>
        {/* A whole tap target, apart from the card under it (ui-audit, 2026-11-24: 20 px tall, crowding the rating). */}
        <button type="button" onClick={() => setAssistantOverCase(false)} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">{t('case.backToCaseLink')}</button>
      </p>}
      {mode === 'assistant' && !open && data.recent && <div className="mb-3 space-y-2">
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-foreground/[0.04] px-3.5 py-2 text-sm dark:bg-white/[0.05]">
          <span>{t('case.recent', { topic: t(`handoff.topics.${data.recent.topic}`), status: t(`statuses.${data.recent.status}`) })}</span>
          <Link href={routes.app.supportCase(data.recent.id)} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">{t('case.recentLink')}</Link>
        </p>
        {/* A case solved lately asks how the help was (2026-11-23). */}
        {data.recent.rating && onRate && <SupportRatingCard key={data.recent.id} rating={data.recent.rating} variant="chat" onRate={(input) => onRate(data.recent!.id, input)} />}
      </div>}

      {mode === 'case' && open
        ? <ol className="space-y-3">
          {open.events.map((event) => <CaseEvent key={event.id} event={event} now={now} />)}
          {supportTyping && <TypingBubble label={agent ? t('live.typing', { name: agent }) : t('live.typingSupport')} />}
          {live?.state === 'waiting' && <li className="flex justify-center"><div role="status" className="flex max-w-[92%] items-start gap-2.5 rounded-2xl border border-primary/25 bg-brand-soft/50 px-3.5 py-2.5 text-sm">
            {live.agentsOnline ? <Spinner aria-hidden="true" className="mt-0.5 shrink-0 text-primary" /> : <Headset aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />}
            {/* Nobody on now: outside live chat hours it says when it opens, and that the reply comes here and by email
                (2026-11-23); in hours, that someone will reply. */}
            {live.agentsOnline
              ? <span>{t('live.waiting', { position: live.position ?? 1 })}</span>
              : data.liveHours.open ? <span>{t('live.offline')}</span> : <LiveChatHoursLine hours={data.liveHours} waiting className="text-sm text-foreground" />}
          </div></li>}
          {live?.state === 'ended' && <li className="flex justify-center"><p className="max-w-[92%] text-center text-sm text-muted-foreground">{t('live.ended')}</p></li>}
          {!live && !supportReplied && open.canReply && <li className="flex justify-center"><p className="max-w-[92%] rounded-2xl border border-dashed border-foreground/[0.14] px-3.5 py-2.5 text-center text-sm text-muted-foreground dark:border-white/[0.12]">{t('case.waiting')} {t('case.replyHours', { hours: open.replyHours })}</p></li>}
          {caseRating}
          {caseTranscript}
        </ol>
        : <ol className="space-y-3">
          <li className="flex min-w-0 flex-col items-start gap-1.5"><article className={cn(bubble, theirs)}>
            <Sender>{t('assistant')}</Sender>
            <p>{name ? t('greeting', { name }) : t('greetingNoName')}</p>
          </article>
          {/* When a person answers live chats (2026-11-23): the greeting says one is a tap away. */}
          <LiveChatHoursLine hours={data.liveHours} className="max-w-[88%] px-1" /></li>
          {!data.assistantAvailable && <li className="flex min-w-0 flex-col items-start gap-2">
            <p className={cn(bubble, theirs, 'text-sm text-muted-foreground')}>{t('unavailable')}</p>
          </li>}
          {data.assistantAvailable && turns.length === 0 && !transcript.pending && <li>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('suggestionsLabel')}</p>
            <ul className="flex flex-wrap gap-1.5">
              {SUGGESTIONS[data.viewer.mode].map((key) => <li key={key}><button type="button" onClick={() => handlers.onAsk(t(`suggestions.${key}`))} className="inline-flex min-h-9 items-center rounded-full border border-foreground/[0.1] bg-card px-3 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring dark:border-white/[0.1]">{t(`suggestions.${key}`)}</button></li>)}
            </ul>
          </li>}
          {turns.map((turn, index) => <li key={turn.id} className="space-y-3">
            <ol className="space-y-3">
              <li className="flex min-w-0 flex-col items-end"><p className={cn(bubble, mine, 'whitespace-pre-line')}><span className="sr-only">{t('you')}: </span>{turn.question}</p></li>
              <AnswerBubble turn={turn} latest={index === turns.length - 1 && !transcript.pending} connecting={connecting} onTalk={() => void connect()} hours={data.liveHours} />
            </ol>
          </li>)}
          {transcript.pending && <>
            <li className="flex min-w-0 flex-col items-end"><p className={cn(bubble, mine, 'whitespace-pre-line')}><span className="sr-only">{t('you')}: </span>{transcript.pending}</p></li>
            <TypingBubble label={t('thinking')} />
          </>}
          {connecting && <li className="flex justify-center"><p role="status" className={cn(notice, 'flex items-center gap-2')}><Spinner aria-hidden="true" />{t('live.connecting')}</p></li>}
          {askError && <li><div role="alert" className="space-y-2 rounded-2xl bg-destructive/[0.07] px-3.5 py-2.5 text-sm">
            <p className="flex items-start gap-2"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />{askError}</p>
            {canRetry && <Button type="button" size="sm" variant="outline" onClick={handlers.onRetry} className="rounded-full"><RotateCcw aria-hidden="true" />{t('retry')}</Button>}
          </div></li>}
          {(turns.length > 0 || !data.assistantAvailable) && <li><p className="px-1 text-center text-xs text-muted-foreground">{t('aiNote')}</p></li>}
        </ol>}
      {connectError && <p role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-destructive/[0.07] px-3.5 py-2.5 text-sm"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />{connectError}</p>}
    </div>

    {mode === 'case' && open
      ? open.canReply
        ? <>
          {replyError && <p role="alert" className="flex items-start gap-2 border-t border-foreground/[0.07] bg-destructive/[0.06] px-3 py-2 text-sm dark:border-white/[0.06]"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />{replyError}</p>}
          <Composer label={t('case.reply')} placeholder={t('case.placeholder')} max={2000} sendLabel={t('case.send')} sendingLabel={t('case.sending')} pending={replyPending} onSend={reply} {...(live && live.state !== 'ended' && handlers.onTyping ? { onTyping: handlers.onTyping } : {})} below={<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {open.canRequestLive && handlers.onRequestLive && <button type="button" onClick={() => void connect()} disabled={connecting} className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-60"><Headset aria-hidden="true" className="size-3.5" />{connecting ? t('live.connecting') : t('live.request')}</button>}
            <button type="button" onClick={() => setAssistantOverCase(true)} className="text-xs font-medium text-primary underline-offset-4 hover:underline">{t('case.askAssistant')}</button>
          </span>} />
        </>
        : <div role="status" className="space-y-2 border-t border-foreground/[0.07] bg-muted/60 px-3 py-3 text-center text-sm dark:border-white/[0.06]">
          <p>{t('case.closed')}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setAssistantOverCase(true)} className="rounded-full">{t('case.askAssistant')}</Button>
        </div>
      : data.assistantAvailable
        ? <Composer label={t('question')} placeholder={t('placeholder')} max={ASSISTANT_QUESTION_MAX} sendLabel={t('send')} sendingLabel={t('sending')} pending={Boolean(transcript.pending)} onSend={(text) => {
          handlers.onAsk(text);
          return true;
        }} below={talkButton('-ml-2')} />
        : <div className="border-t border-foreground/[0.07] bg-card px-3 py-3 dark:border-white/[0.06]"><Button type="button" onClick={() => void connect()} disabled={connecting} aria-busy={connecting} className="w-full rounded-full">{connecting ? <Spinner aria-hidden="true" /> : <UserRound aria-hidden="true" />}{connecting ? t('live.connecting') : t('talkToPerson')}</Button></div>}
  </div>;
}
