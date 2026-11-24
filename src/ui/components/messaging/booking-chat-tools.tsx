'use client';

import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowRight, Car, Check, ChevronDown, CircleCheckBig, Clock, Handshake, MapPinCheck, Send, UserRoundCheck } from 'lucide-react';
import { LATE_BY_MINUTES, routes, type ActionDescriptor, type ActionResult, type BookingAgreement, type BookingChatActionId, type BookingChatActionInput, type LateByMinutes } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * A booking's conversation, 2026-11-24 (owner: "implement others all one by one"): the day-of updates as chips above the
 * composer (the booking page's own actions, as the app gives them), and "What we agreed" pinned on top of the messages.
 */

const CHIP_ICONS: Record<BookingChatActionId, typeof Car> = {
  on_my_way: Car,
  running_late: Clock,
  arrived: MapPinCheck,
  im_here: UserRoundCheck,
  submit_completion: CircleCheckBig,
};

const chipClass = (primary: boolean, compact: boolean) => cn(
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60',
  compact ? 'min-h-9 px-3 text-xs' : 'min-h-11 px-3.5 text-sm',
  primary ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90' : 'border-foreground/[0.12] bg-card text-foreground hover:bg-accent dark:border-white/[0.12]',
);

/**
 * The chips: each one the booking page's action, run from here. Running late asks by how many minutes first (as the
 * booking page's sheet), and Send for approval opens the completion form over the page.
 */
export function BookingDayChips({ actions, bookingId, onAction, onDone, compact = false }: {
  actions: ActionDescriptor<BookingChatActionId>[];
  bookingId: string;
  onAction?: (input: BookingChatActionInput) => Promise<ActionResult>;
  /** After an update: the conversation reads again (the chat window; the page refreshes with the action). */
  onDone?: () => void;
  compact?: boolean;
}) {
  const t = useTranslations('thread.dayOf');
  const [pending, setPending] = useState<BookingChatActionId | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (actions.length === 0) return null;

  async function run(input: BookingChatActionInput): Promise<boolean> {
    if (!onAction || pending) return false;
    setPending(input.action);
    setFailed(null);
    try {
      const result = await onAction(input);
      if (result.ok) {
        toast.success(t(`done.${input.action}`));
        onDone?.();
        return true;
      }
      setFailed(result.code === 'rate_limited' ? t('errors.rate_limited') : result.code === 'not_allowed' || result.code === 'version_conflict' || result.code === 'not_found' ? t('errors.changed') : t('errors.unknown'));
    } catch {
      setFailed(t('errors.unknown'));
    } finally {
      setPending(null);
    }
    return false;
  }

  return <div className={cn('border-t border-foreground/[0.07] dark:border-white/[0.06]', compact ? 'px-2.5 py-1.5' : 'px-3 py-2 sm:px-4')}>
    <div role="group" aria-label={t('label')} className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
      {actions.map((action) => {
        const Icon = CHIP_ICONS[action.id];
        const primary = action.kind === 'primary';
        const label = t(`labels.${action.id}`);
        if (action.id === 'submit_completion') {
          // The completion form opens over the page (its route dialog), as from the booking page.
          return <Link key={action.id} href={routes.app.bookingComplete(bookingId)} data-day-of={action.id} className={chipClass(primary, compact)}><Icon aria-hidden="true" className="size-4" />{label}</Link>;
        }
        if (action.id === 'running_late' || action.confirm) {
          return <AskFirst key={action.id} action={action.id} label={label} icon={<Icon aria-hidden="true" className="size-4" />} className={chipClass(primary, compact)} disabled={!onAction || pending !== null} pending={pending === action.id} onSend={run} />;
        }
        return <button key={action.id} type="button" data-day-of={action.id} disabled={!onAction || pending !== null} aria-busy={pending === action.id} onClick={() => void run({ action: action.id })} className={chipClass(primary, compact)}>
          {pending === action.id ? <Spinner aria-hidden="true" /> : <Icon aria-hidden="true" className="size-4" />}{label}
        </button>;
      })}
    </div>
    {failed && <p role="alert" className="pt-1 text-xs text-destructive">{failed}</p>}
  </div>;
}

/** A chip that asks first in a small popover: by how many minutes (running late), or to confirm. Its trigger gets focus back. */
function AskFirst({ action, label, icon, className, disabled, pending, onSend }: {
  action: BookingChatActionId;
  label: string;
  icon: ReactNode;
  className: string;
  disabled: boolean;
  pending: boolean;
  onSend(input: BookingChatActionInput): Promise<boolean>;
}) {
  const t = useTranslations('thread.dayOf');
  const id = useId();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<LateByMinutes | null>(null);
  const late = action === 'running_late';
  const ready = !late || minutes !== null;
  async function send() {
    if (!ready || pending) return;
    if (await onSend(late && minutes !== null ? { action, minutes } : { action })) {
      setOpen(false);
      setMinutes(null);
    }
  }
  return <Popover open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
    <PopoverTrigger asChild>
      <button type="button" data-day-of={action} disabled={disabled} aria-busy={pending} className={className}>{pending ? <Spinner aria-hidden="true" /> : icon}{label}</button>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" className="w-72 space-y-3">
      <p id={`${id}-title`} className="text-sm font-semibold">{late ? t('late.title') : t('confirm', { action: label })}</p>
      {late && <div role="radiogroup" aria-labelledby={`${id}-title`} className="grid grid-cols-3 gap-2">
        {LATE_BY_MINUTES.map((value) => <button key={value} type="button" role="radio" aria-checked={minutes === value} onClick={() => setMinutes(value)} className={cn('min-h-11 rounded-xl border text-sm font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-ring', minutes === value ? 'border-primary bg-brand-soft text-foreground' : 'border-foreground/[0.12] hover:bg-accent dark:border-white/[0.12]')}>{t('late.minutes', { minutes: value })}</button>)}
      </div>}
      {late && <p className="text-xs text-muted-foreground">{t('late.hint')}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>{t('cancel')}</Button>
        <Button type="button" size="sm" disabled={!ready || pending} aria-busy={pending} onClick={() => void send()}>{pending ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" />}{t('send')}</Button>
      </div>
    </PopoverContent>
  </Popover>;
}

// ---- What we agreed ---------------------------------------------------------------------------------------------------

/** Open or folded, per conversation, kept in this browser (and in memory where storage is off). */
const folded = new Map<string, boolean>();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}
function storedOpen(key: string): boolean | null {
  if (folded.has(key)) return folded.get(key)!;
  try {
    const value = window.localStorage.getItem(key);
    return value === 'open' ? true : value === 'closed' ? false : null;
  } catch {
    return null;
  }
}
function useStoredOpen(key: string, fallback: boolean): [boolean, () => void] {
  const stored = useSyncExternalStore(subscribe, () => storedOpen(key), () => null);
  const open = stored ?? fallback;
  const toggle = () => {
    folded.set(key, !open);
    try {
      window.localStorage.setItem(key, open ? 'closed' : 'open');
    } catch {
      // Storage off (a private window): it stays as chosen until the page reloads.
    }
    for (const listener of listeners) listener();
  };
  return [open, toggle];
}

export const agreementStorageKey = (threadId: string) => `tnm.agreement.${threadId}`;

/**
 * "What we agreed", pinned on top of a booking's conversation: the task, when (on the booking market's clock), the price
 * as this viewer sees it, what's included and the category's checklist, and Propose a change (its dialog over the page).
 * Folds to one line; the window shows it folded until it's opened there or on the page.
 */
export function AgreementCard({ agreement, threadId, canProposeChange = false, compact = false }: {
  agreement: BookingAgreement;
  threadId: string;
  canProposeChange?: boolean;
  compact?: boolean;
}) {
  return <TimeZoneProvider timeZone={agreement.timeZone}><Agreement agreement={agreement} threadId={threadId} canProposeChange={canProposeChange} compact={compact} /></TimeZoneProvider>;
}

function Agreement({ agreement, threadId, canProposeChange, compact }: { agreement: BookingAgreement; threadId: string; canProposeChange: boolean; compact: boolean }) {
  const t = useTranslations('thread.agreement');
  const items = useTranslations('completion.checklist.items');
  const { formatDate, formatDateTime, formatTimeRange, zoneName } = useFormat();
  const id = useId();
  const [open, toggle] = useStoredOpen(agreementStorageKey(threadId), !compact);
  const { pricing, money, window: schedule } = agreement;
  const amount = formatMoney(money.amountCents);
  const rate = pricing.type === 'hourly' ? t('hourly', { rate: formatMoney(pricing.rateCents), hours: formatHours(pricing.estimatedHours), cap: formatHours(pricing.hoursCap) }) : null;
  // Under the page's h1, or under the window's h3 with the other person's name.
  const Heading = compact ? 'h4' : 'h2';
  return <section aria-labelledby={`${id}-title`} data-agreement={open ? 'open' : 'closed'} className="shrink-0 border-b border-foreground/[0.07] bg-brand-soft/35 dark:border-white/[0.06] dark:bg-white/[0.03]">
    <Heading className="m-0">
      <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={toggle} className={cn('flex w-full min-w-0 items-center gap-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', compact ? 'min-h-10 px-3 py-1.5 text-xs' : 'min-h-11 px-4 py-2 text-sm')}>
        <Handshake aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span id={`${id}-title`} className="shrink-0 font-semibold">{t('title')}</span>
        <span className="min-w-0 truncate text-muted-foreground tabular-nums">{t('summary', { when: formatDateTime(agreement.start), amount })}</span>
        <ChevronDown aria-hidden="true" className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
    </Heading>
    <div id={`${id}-body`} hidden={!open} className={cn('overflow-y-auto overscroll-contain', compact ? 'max-h-48 space-y-2 px-3 pb-2.5 text-xs' : 'max-h-[min(30vh,20rem)] space-y-3 px-4 pb-3 text-sm')}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">{t('task')}</dt>
        <dd className="font-medium [overflow-wrap:anywhere]">{agreement.title}</dd>
        <dt className="text-muted-foreground">{t('when')}</dt>
        <dd className="tabular-nums">
          {formatDateTime(agreement.start)} <span className="text-muted-foreground">{zoneName}</span>
          <span className="block text-muted-foreground">{schedule.flexible ? t('anyTime', { day: formatDate(schedule.windowStart) }) : t('window', { range: formatTimeRange(schedule.windowStart, schedule.windowEnd) })}{agreement.remote ? ` · ${t('remote')}` : ''}</span>
        </dd>
        <dt className="text-muted-foreground">{t(`money.${money.kind}`)}</dt>
        <dd className="tabular-nums"><span className="font-semibold">{amount}</span>{rate && <span className="block text-muted-foreground">{rate}</span>}</dd>
        {agreement.expenseAllowance && <>
          <dt className="text-muted-foreground">{t('expenses')}</dt>
          <dd className="[overflow-wrap:anywhere]"><span className="tabular-nums">{formatMoney(agreement.expenseAllowance.amountCents)}</span>{agreement.expenseAllowance.description && <span className="text-muted-foreground"> · {agreement.expenseAllowance.description}</span>}</dd>
        </>}
      </dl>
      <div className="space-y-0.5">
        <p className="font-semibold">{t('included')}</p>
        <p className="whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{agreement.scope}</p>
      </div>
      {agreement.checklist.length > 0 && <div className="space-y-1">
        <p className="font-semibold">{t('checklist')}</p>
        <ul className="space-y-0.5">
          {agreement.checklist.map((key) => <li key={key} className="flex items-start gap-1.5"><Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" /><span>{items(`${agreement.categorySlug}.${key}`)}</span></li>)}
        </ul>
      </div>}
      {canProposeChange && <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-muted-foreground">{t('changeHint')}</span>
        <Link href={routes.app.bookingProposeChange(agreement.bookingId)} className={cn('group/change inline-flex items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline', compact ? 'min-h-9' : 'min-h-11')}>{t('propose')}<ArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover/change:translate-x-0.5 motion-reduce:transition-none" /></Link>
      </p>}
    </div>
  </section>;
}
