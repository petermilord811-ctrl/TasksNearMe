'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, CircleAlert, LifeBuoy, RotateCcw, Send, ShieldAlert, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ASSISTANT_QUESTION_MAX,
  SUPPORT_TOPICS,
  type ActionResult,
  type AssistantTranscript,
  type AssistantTurn,
  type CaseEventView,
  type HelpChatData,
  type HelpChatHandlers,
  type ISODateTime,
  type Mode,
  type SupportTopic,
} from '@/contracts';
import { routes } from '@/contracts/routes';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
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
  /** Previews: the hand-off form open from the start. */
  initialHandoff?: boolean;
}

const SUGGESTIONS: Record<Mode, readonly string[]> = {
  poster: ['charged', 'cancel', 'address', 'problem'],
  helper: ['paid', 'verified', 'price', 'problem'],
};

const bubble = 'min-w-0 max-w-[88%] space-y-1.5 rounded-[1.25rem] px-3.5 py-2.5 text-[15px] leading-6 [overflow-wrap:anywhere]';
const theirs = 'rounded-bl-md border border-foreground/[0.07] bg-background shadow-[0_1px_2px_rgb(23_18_14/0.05)] dark:border-white/[0.07]';
const mine = 'rounded-br-md bg-secondary text-secondary-foreground';

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
function AnswerBubble({ turn, latest, onTalk }: { turn: AssistantTurn; latest: boolean; onTalk(): void }) {
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
    {latest && answer.handoff !== 'none' && <HandoffCard urgent={answer.handoff === 'urgent'} onTalk={onTalk} />}
  </li>;
}

function HandoffCard({ urgent, onTalk }: { urgent: boolean; onTalk(): void }) {
  const t = useTranslations('chat.help');
  return <div role={urgent ? 'alert' : undefined} className={cn('w-full max-w-[88%] space-y-2 rounded-2xl border px-3.5 py-3 text-sm', urgent ? 'border-destructive/40 bg-destructive/[0.06]' : 'border-primary/25 bg-brand-soft/50')}>
    <p className="flex items-start gap-2 font-semibold">{urgent ? <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" /> : <LifeBuoy aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />}{urgent ? t('urgentTitle') : t('suggestPerson')}</p>
    {urgent && <p className="text-muted-foreground">{t('urgentBody')}</p>}
    <Button type="button" size="sm" variant={urgent ? 'destructive' : 'default'} onClick={onTalk} className="rounded-full"><UserRound aria-hidden="true" />{t('talkToPerson')}</Button>
  </div>;
}

function CaseEvent({ event, now }: { event: CaseEventView; now: ISODateTime }) {
  const t = useTranslations('chat.help');
  const { formatTime, formatDateTime, formatRelative } = useFormat();
  if (event.kind === 'status') {
    return <li className="flex justify-center"><p className="rounded-full bg-foreground/[0.045] px-3 py-1 text-center text-xs font-medium text-muted-foreground dark:bg-white/[0.06]">{t('case.status', { status: t(`statuses.${event.status ?? 'open'}`) })}</p></li>;
  }
  const own = event.from === 'me';
  const sender = own ? t('you') : event.from === 'assistant' ? t('assistant') : event.from === 'support' ? t('support') : t('update');
  return <li className={cn('flex min-w-0 flex-col', own ? 'items-end' : 'items-start')}>
    <article className={cn(bubble, own ? mine : theirs, event.from === 'assistant' && 'bg-muted/60')}>
      <p className={cn('text-xs font-semibold', own ? 'sr-only' : event.from === 'support' ? 'text-primary' : 'text-muted-foreground')}>{sender}</p>
      {event.from === 'assistant' ? <AnswerText text={event.body ?? ''} /> : <p className="whitespace-pre-line">{event.body}</p>}
      <time dateTime={event.at} title={formatRelative(event.at, now)} className={cn('block text-xs tabular-nums', own ? 'text-right' : 'text-muted-foreground')}><span aria-hidden="true">{formatTime(event.at)}</span><span className="sr-only">{formatDateTime(event.at)}</span></time>
    </article>
  </li>;
}

type FieldErrors = Partial<Record<'topic' | 'details' | 'bookingId', string>>;

function errorsOf(result: ActionResult): FieldErrors {
  if (result.ok || !result.fieldErrors) return {};
  const pick = (name: string) => result.fieldErrors?.[name]?.[0];
  return { ...(pick('topic') ? { topic: 'required' } : {}), ...(pick('details') ? { details: pick('details') } : {}), ...(pick('bookingId') ? { bookingId: 'invalid' } : {}) };
}

/** "Talk to a person": the topic, what support should know (their last question to start), a booking, then Send. */
function HandoffForm({ data, transcript, onSubmit, onCancel }: { data: HelpChatData; transcript: AssistantTranscript; onSubmit: HelpChatHandlers['onHandOff']; onCancel(): void }) {
  const t = useTranslations('chat.help.handoff');
  const { formatDate, formatDateTime, zoneName } = useFormat();
  const id = useId();
  const last = transcript.turns.at(-1);
  const urgent = transcript.turns.some((turn) => turn.answer.handoff === 'urgent');
  const [topic, setTopic] = useState<SupportTopic>(urgent ? 'safety' : last?.answer.topic ?? 'other');
  const [details, setDetails] = useState(last?.question ?? transcript.error?.question ?? '');
  const [bookingId, setBookingId] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | undefined>();
  const detailsRef = useRef<HTMLTextAreaElement>(null);
  const fieldErrors = result ? errorsOf(result) : {};
  const detailsError = fieldErrors.details === 'too_long' ? t('errors.too_long') : fieldErrors.details ? t('errors.required') : undefined;

  useEffect(() => {
    detailsRef.current?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!details.trim()) {
      setResult({ ok: false, code: 'validation_failed', fieldErrors: { details: ['required'] } });
      detailsRef.current?.focus();
      return;
    }
    setPending(true);
    let next: ActionResult;
    try {
      next = await onSubmit({ topic, details: details.trim(), ...(bookingId ? { bookingId } : {}) });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    setPending(false);
    setResult(next);
    if (!next.ok && next.fieldErrors?.details) detailsRef.current?.focus();
  }

  const failure = result && !result.ok && !Object.keys(fieldErrors).length
    ? result.code === 'rate_limited' && result.retryAt ? t('errors.rate_limited', { time: `${formatDateTime(result.retryAt)} ${zoneName}` }) : t('errors.unknown')
    : undefined;
  // Never taller than most of the conversation: on a phone it scrolls inside, so Send and Back stay reachable.
  return <form noValidate onSubmit={submit} aria-labelledby={`${id}-title`} aria-busy={pending} className="max-h-[80%] shrink-0 space-y-3 overflow-y-auto overscroll-contain border-t border-foreground/[0.07] bg-card px-3 py-3 dark:border-white/[0.06]">
    <div className="space-y-1">
      <h3 id={`${id}-title`} className="flex items-center gap-2 font-semibold"><UserRound aria-hidden="true" className="size-4 text-primary" />{t('title')}</h3>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor={`${id}-topic`}>{t('topic')}</label>
        <select id={`${id}-topic`} value={topic} onChange={(event) => setTopic(event.target.value as SupportTopic)} disabled={pending} className="min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-base font-normal sm:text-sm">
          {SUPPORT_TOPICS.map((option) => <option key={option} value={option}>{t(`topics.${option}`)}</option>)}
        </select>
      </div>
      {data.handoff.bookings.length > 0 && <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor={`${id}-booking`}>{t('booking')}</label>
        <select id={`${id}-booking`} value={bookingId} onChange={(event) => setBookingId(event.target.value)} disabled={pending} aria-invalid={Boolean(fieldErrors.bookingId)} aria-describedby={fieldErrors.bookingId ? `${id}-booking-error` : undefined} className="min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-base font-normal sm:text-sm">
          <option value="">{t('noBooking')}</option>
          {data.handoff.bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.title} · {formatDate(booking.start)}</option>)}
        </select>
        {fieldErrors.bookingId && <span id={`${id}-booking-error`} className="block text-sm text-destructive">{t('errors.invalid')}</span>}
      </div>}
    </div>
    <div className="space-y-1">
      <label htmlFor={`${id}-details`} className="text-sm font-medium">{t('details')}</label>
      <Textarea ref={detailsRef} id={`${id}-details`} value={details} onChange={(event) => setDetails(event.target.value)} rows={3} maxLength={2000} readOnly={pending} aria-invalid={Boolean(detailsError)} aria-describedby={`${id}-details-hint${detailsError ? ` ${id}-details-error` : ''}`} className="max-h-48 min-h-20 resize-none field-sizing-content" />
      <p id={`${id}-details-hint`} className="text-xs text-muted-foreground">{t('detailsHint')}</p>
      {detailsError && <p id={`${id}-details-error`} className="text-sm text-destructive">{detailsError}</p>}
    </div>
    <p className="text-xs text-muted-foreground">{t('replyHours', { hours: data.handoff.replyHours[topic] })}</p>
    {failure && <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/[0.07] px-3 py-2 text-sm"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />{failure}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Button type="submit" disabled={pending} aria-busy={pending} className="rounded-full">{pending ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" />}{t(pending ? 'sending' : 'send')}</Button>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={pending} className="rounded-full">{t('cancel')}</Button>
    </div>
  </form>;
}

/** The box at the bottom: a question for the assistant, or a message to support. Enter sends on wide screens. */
function Composer({ label, placeholder, max, sendLabel, sendingLabel, pending, onSend, disabled = false, below }: {
  label: string;
  placeholder: string;
  max: number;
  sendLabel: string;
  sendingLabel: string;
  pending: boolean;
  onSend(text: string): Promise<boolean> | boolean;
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
      <Textarea ref={ref} id={`${id}-text`} rows={1} maxLength={max} value={text} disabled={disabled} placeholder={placeholder} aria-describedby={`${id}-count`} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
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
 * center (each answer with the articles it used); "Talk to a person" is always one tap away, and the assistant offers it
 * itself when something needs staff, or first thing when someone may be in danger (911). Once the person asks, the chat
 * goes to support as a case, and this shows that case: the chat, their request, then support's replies as they come.
 * Everything comes in through `data` and `transcript`; the app does the asking and the sending.
 */
export function HelpChat({ data, transcript, handlers, now, variant = 'window', initialHandoff = false }: HelpChatProps) {
  const t = useTranslations('chat.help');
  const { formatDateTime, zoneName } = useFormat();
  const [handoffOpen, setHandoffOpen] = useState(initialHandoff);
  const [assistantOverCase, setAssistantOverCase] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const [replyResult, setReplyResult] = useState<ActionResult | undefined>();
  const logRef = useRef<HTMLDivElement>(null);
  const open = data.case;
  const mode = open && !assistantOverCase ? 'case' : 'assistant';
  const turns = transcript.turns;
  const name = data.viewer.firstName;

  // The newest line stays in view: a question, its answer, the form, support's reply.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [mode, turns.length, transcript.pending, transcript.error, open?.events.length, handoffOpen]);

  // A case came in (the hand-off went through): the form's job is done (adjusted while rendering).
  const openId = open?.id;
  const [caseBefore, setCaseBefore] = useState(openId);
  if (openId !== caseBefore) {
    setCaseBefore(openId);
    if (openId) setHandoffOpen(false);
  }

  const lastAnswer = turns.at(-1);
  const announcement = transcript.pending ? t('thinking') : lastAnswer ? `${t('assistant')}: ${lastAnswer.answer.text}` : '';
  const talk = () => {
    setAssistantOverCase(false);
    setHandoffOpen(true);
  };

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
  const supportReplied = open?.events.some((event) => event.from === 'support') ?? false;

  return <div className="flex min-h-0 flex-1 flex-col">
    {/* Who this is with, and what it is now: the assistant, or the support team once a case is open. */}
    <header className={cn('flex min-w-0 items-center gap-2.5 border-b border-foreground/[0.07] dark:border-white/[0.06]', variant === 'page' ? 'px-4 py-3' : 'px-3 py-2.5')}>
      <HelpAvatar size="sm" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-semibold">{t('title')}</h3>
        <p className="truncate text-xs text-muted-foreground">{mode === 'case' ? t('subtitleSupport') : t('subtitleAssistant')}</p>
      </div>
      {mode === 'case' && open && <Link href={routes.app.supportCase(open.id)} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'shrink-0 rounded-full text-primary' })}>{t('case.openCase')}<ArrowUpRight aria-hidden="true" /></Link>}
      {mode === 'assistant' && turns.length > 0 && !transcript.pending && <Button type="button" variant="ghost" size="sm" onClick={() => { setHandoffOpen(false); handlers.onStartOver(); }} className="shrink-0 rounded-full"><RotateCcw aria-hidden="true" />{t('startOver')}</Button>}
    </header>

    <div aria-live="polite" className="sr-only">{announcement}</div>
    <div ref={logRef} role="log" aria-label={t('log')} aria-live="off" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 [overflow-anchor:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
      {mode === 'assistant' && open && <p className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/25 bg-brand-soft/50 px-3.5 py-2 text-sm">
        <span>{t('case.backToCase')}</span>
        <button type="button" onClick={() => setAssistantOverCase(false)} className="font-semibold text-primary underline-offset-4 hover:underline">{t('case.backToCaseLink')}</button>
      </p>}
      {mode === 'assistant' && !open && data.recent && <p className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-foreground/[0.04] px-3.5 py-2 text-sm dark:bg-white/[0.05]">
        <span>{t('case.recent', { topic: t(`handoff.topics.${data.recent.topic}`), status: t(`statuses.${data.recent.status}`) })}</span>
        <Link href={routes.app.supportCase(data.recent.id)} className="font-semibold text-primary underline-offset-4 hover:underline">{t('case.recentLink')}</Link>
      </p>}

      {mode === 'case' && open
        ? <ol className="space-y-3">
          {open.events.map((event) => <CaseEvent key={event.id} event={event} now={now} />)}
          {!supportReplied && open.canReply && <li className="flex justify-center"><p className="max-w-[92%] rounded-2xl border border-dashed border-foreground/[0.14] px-3.5 py-2.5 text-center text-sm text-muted-foreground dark:border-white/[0.12]">{t('case.waiting')} {t('case.replyHours', { hours: open.replyHours })}</p></li>}
        </ol>
        : <ol className="space-y-3">
          <li className="flex min-w-0 flex-col items-start"><article className={cn(bubble, theirs)}>
            <Sender>{t('assistant')}</Sender>
            <p>{name ? t('greeting', { name }) : t('greetingNoName')}</p>
          </article></li>
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
              <AnswerBubble turn={turn} latest={index === turns.length - 1 && !transcript.pending && !handoffOpen} onTalk={talk} />
            </ol>
          </li>)}
          {transcript.pending && <>
            <li className="flex min-w-0 flex-col items-end"><p className={cn(bubble, mine, 'whitespace-pre-line')}><span className="sr-only">{t('you')}: </span>{transcript.pending}</p></li>
            <li className="flex min-w-0 flex-col items-start"><p className={cn(bubble, theirs, 'flex items-center gap-2 text-sm text-muted-foreground')}>
              <span aria-hidden="true" className="inline-flex gap-0.5">{[0, 1, 2].map((dot) => <span key={dot} className="size-1.5 animate-bounce rounded-full bg-current motion-reduce:animate-none" style={{ animationDelay: `${dot * 150}ms` }} />)}</span>{t('thinking')}
            </p></li>
          </>}
          {askError && <li><div role="alert" className="space-y-2 rounded-2xl bg-destructive/[0.07] px-3.5 py-2.5 text-sm">
            <p className="flex items-start gap-2"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />{askError}</p>
            {canRetry && <Button type="button" size="sm" variant="outline" onClick={handlers.onRetry} className="rounded-full"><RotateCcw aria-hidden="true" />{t('retry')}</Button>}
          </div></li>}
          {(turns.length > 0 || !data.assistantAvailable) && <li><p className="px-1 text-center text-xs text-muted-foreground">{t('aiNote')}</p></li>}
        </ol>}
    </div>

    {handoffOpen
      ? <HandoffForm data={data} transcript={transcript} onSubmit={handlers.onHandOff} onCancel={() => setHandoffOpen(false)} />
      : mode === 'case' && open
        ? open.canReply
          ? <>
            {replyError && <p role="alert" className="flex items-start gap-2 border-t border-foreground/[0.07] bg-destructive/[0.06] px-3 py-2 text-sm dark:border-white/[0.06]"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />{replyError}</p>}
            <Composer label={t('case.reply')} placeholder={t('case.placeholder')} max={2000} sendLabel={t('case.send')} sendingLabel={t('case.sending')} pending={replyPending} onSend={reply} below={<button type="button" onClick={() => setAssistantOverCase(true)} className="text-xs font-medium text-primary underline-offset-4 hover:underline">{t('case.askAssistant')}</button>} />
          </>
          : <div role="status" className="space-y-2 border-t border-foreground/[0.07] bg-muted/60 px-3 py-3 text-center text-sm dark:border-white/[0.06]">
            <p>{t('case.closed')}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setAssistantOverCase(true)} className="rounded-full">{t('case.askAssistant')}</Button>
          </div>
        : data.assistantAvailable
          ? <Composer label={t('question')} placeholder={t('placeholder')} max={ASSISTANT_QUESTION_MAX} sendLabel={t('send')} sendingLabel={t('sending')} pending={Boolean(transcript.pending)} onSend={(text) => {
            handlers.onAsk(text);
            return true;
          }} below={<Button type="button" variant="ghost" size="sm" onClick={talk} className="-ml-2 rounded-full"><UserRound aria-hidden="true" />{t('talkToPerson')}</Button>} />
          : <div className="border-t border-foreground/[0.07] bg-card px-3 py-3 dark:border-white/[0.06]"><Button type="button" onClick={talk} className="w-full rounded-full"><UserRound aria-hidden="true" />{t('talkToPerson')}</Button></div>}
  </div>;
}
