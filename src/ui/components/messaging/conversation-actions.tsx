'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowRight, CalendarClock, ClipboardList, HandHelping, Plus, Send } from 'lucide-react';
import { routes, SHARE_TIMES_MAX, SHARE_TIMES_MIN, type ActionResult, type AskForOfferInput, type AvailabilitySlotView, type ConversationRequestOptions, type ShareTimesInput } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/primitives/dropdown-menu';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * A direct conversation's "+" (2026-11-23, owner: "once started conversation, it's unable to request task or request
 * offer"): Request a task (the request dialog over the page), Ask for an offer on one of your open tasks (a card in the
 * conversation the helper answers with an offer), and, for a helper, Make an offer on the other person's open tasks
 * (the offer form in a dialog over the page). Never a trip to another page.
 */
export function ConversationActionsMenu({ options, name, onAskForOffer, onShareTimes, compact = false }: {
  options: ConversationRequestOptions;
  /** The other person's first name. */
  name: string;
  onAskForOffer?: (input: AskForOfferInput) => Promise<ActionResult>;
  /** Share times, for a helper (2026-11-24): two or three of their open slots as a card. */
  onShareTimes?: (input: ShareTimesInput) => Promise<ActionResult>;
  compact?: boolean;
}) {
  const t = useTranslations('thread.plus');
  const [dialog, setDialog] = useState<'ask' | 'theirs' | 'share' | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const canAsk = Boolean(onAskForOffer) && options.myOpenTasks.length > 0;
  const canOffer = options.theirOpenTasks.length > 0;
  const slots = options.shareableSlots ?? [];
  const canShare = Boolean(onShareTimes) && slots.length >= SHARE_TIMES_MIN;
  if (!options.requestHandle && !canAsk && !canOffer && !canShare) return null;
  // State-opened dialogs give focus back to the + by hand (memory: no trigger, focus would go to the page).
  const restore = (event: Event) => { event.preventDefault(); trigger.current?.focus(); };
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button ref={trigger} type="button" aria-label={t('label', { name })} title={t('label', { name })} className={cn('grid shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-accent data-[state=open]:text-primary', compact ? 'size-10' : 'size-12')}>
          <Plus aria-hidden="true" className="size-5 transition-transform duration-200 [[data-state=open]>&]:rotate-45" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        {options.requestHandle && <DropdownMenuItem asChild>
          <Link href={routes.app.requestHelper(options.requestHandle)} className="items-start">
            <ClipboardList aria-hidden="true" className="mt-0.5" />
            <span className="space-y-0.5"><span className="block font-medium">{t('request')}</span><span className="block text-xs text-muted-foreground">{t('requestHint', { name })}</span></span>
          </Link>
        </DropdownMenuItem>}
        {canAsk && <DropdownMenuItem onSelect={() => { window.setTimeout(() => setDialog('ask'), 0); }} className="items-start">
          <Send aria-hidden="true" className="mt-0.5" />
          <span className="space-y-0.5"><span className="block font-medium">{t('ask')}</span><span className="block text-xs text-muted-foreground">{t('askHint', { name })}</span></span>
        </DropdownMenuItem>}
        {canOffer && <DropdownMenuItem onSelect={() => { window.setTimeout(() => setDialog('theirs'), 0); }} className="items-start">
          <HandHelping aria-hidden="true" className="mt-0.5" />
          <span className="space-y-0.5"><span className="block font-medium">{t('offer', { name })}</span><span className="block text-xs text-muted-foreground">{t('offerHint', { count: options.theirOpenTasks.length })}</span></span>
        </DropdownMenuItem>}
        {canShare && <DropdownMenuItem onSelect={() => { window.setTimeout(() => setDialog('share'), 0); }} className="items-start">
          <CalendarClock aria-hidden="true" className="mt-0.5" />
          <span className="space-y-0.5"><span className="block font-medium">{t('share')}</span><span className="block text-xs text-muted-foreground">{t('shareHint', { name })}</span></span>
        </DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    {canShare && onShareTimes && <ShareTimesDialog open={dialog === 'share'} onOpenChange={(open) => setDialog(open ? 'share' : null)} slots={slots} name={name} onShare={onShareTimes} onCloseAutoFocus={restore} />}
    {canAsk && onAskForOffer && <AskForOfferDialog open={dialog === 'ask'} onOpenChange={(open) => setDialog(open ? 'ask' : null)} options={options} name={name} onAsk={onAskForOffer} onCloseAutoFocus={restore} />}
    {canOffer && <Dialog open={dialog === 'theirs'} onOpenChange={(open) => setDialog(open ? 'theirs' : null)}>
      <DialogContent onCloseAutoFocus={restore} className="sm:max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <DialogHeader><DialogTitle>{t('theirTitle', { name })}</DialogTitle><DialogDescription>{t('theirDescription')}</DialogDescription></DialogHeader>
        <ul className="space-y-1.5">
          {options.theirOpenTasks.map((task) => <li key={task.id}>
            {/* The offer form opens over the page (its own dialog), so this one closes first. */}
            <Link href={routes.app.findWorkOffer(task.id)} onClick={() => setDialog(null)} className="group/task flex min-h-12 items-center justify-between gap-3 rounded-xl border border-foreground/[0.08] px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring dark:border-white/[0.08]">
              <span className="min-w-0 truncate font-medium">{task.title}</span>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">{t('makeOffer')}<ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover/task:translate-x-0.5 motion-reduce:transition-none" /></span>
            </Link>
          </li>)}
        </ul>
      </DialogContent>
    </Dialog>}
  </>;
}

/** Ask for an offer: choose one of your open tasks, then Send (the card goes into the conversation). */
function AskForOfferDialog({ open, onOpenChange, options, name, onAsk, onCloseAutoFocus }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  options: ConversationRequestOptions;
  name: string;
  onAsk: (input: AskForOfferInput) => Promise<ActionResult>;
  onCloseAutoFocus(event: Event): void;
}) {
  const t = useTranslations('thread.plus');
  const id = useId();
  const [taskId, setTaskId] = useState(options.myOpenTasks[0]?.id ?? '');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  async function send() {
    if (!taskId || pending) return;
    setPending(true);
    setFailed(null);
    try {
      const result = await onAsk({ taskId });
      if (result.ok) {
        toast.success(t('asked', { name }));
        onOpenChange(false);
      } else setFailed(result.code === 'rate_limited' ? t('rateLimited') : result.code === 'not_allowed' ? t('notAllowed') : t('failed'));
    } catch {
      setFailed(t('failed'));
    } finally {
      setPending(false);
    }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="sm:max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
      <DialogHeader><DialogTitle>{t('askTitle', { name })}</DialogTitle><DialogDescription>{t('askDescription', { name })}</DialogDescription></DialogHeader>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">{t('askLegend')}</legend>
        {options.myOpenTasks.map((task) => <label key={task.id} htmlFor={`${id}-${task.id}`} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors', taskId === task.id ? 'border-primary/50 bg-brand-soft/60' : 'border-foreground/[0.08] hover:bg-accent dark:border-white/[0.08]')}>
          <input id={`${id}-${task.id}`} type="radio" name={`${id}-task`} value={task.id} checked={taskId === task.id} onChange={() => setTaskId(task.id)} className="size-4 accent-[var(--primary)]" />
          <span className="min-w-0 truncate font-medium">{task.title}</span>
        </label>)}
      </fieldset>
      {failed && <p role="alert" className="text-sm text-destructive">{failed}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
        <Button type="button" disabled={!taskId || pending} aria-busy={pending} onClick={() => void send()}>{pending ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" />}{t('askSend')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** Share times: choose two or three of your open slots, then Share (the card goes into the conversation). */
function ShareTimesDialog({ open, onOpenChange, slots, name, onShare, onCloseAutoFocus }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  slots: AvailabilitySlotView[];
  name: string;
  onShare: (input: ShareTimesInput) => Promise<ActionResult>;
  onCloseAutoFocus(event: Event): void;
}) {
  const t = useTranslations('thread.plus');
  const categories = useTranslations('taskCard.categories');
  const { formatDate, formatTimeRange, zoneName } = useFormat();
  const id = useId();
  const [chosen, setChosen] = useState<string[]>(() => slots.slice(0, SHARE_TIMES_MIN).map((slot) => slot.id));
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const ready = chosen.length >= SHARE_TIMES_MIN && chosen.length <= SHARE_TIMES_MAX;
  const toggle = (slotId: string) => setChosen((now) => (now.includes(slotId) ? now.filter((item) => item !== slotId) : now.length < SHARE_TIMES_MAX ? [...now, slotId] : now));
  async function share() {
    if (!ready || pending) return;
    setPending(true);
    setFailed(null);
    try {
      const result = await onShare({ slotIds: slots.filter((slot) => chosen.includes(slot.id)).map((slot) => slot.id) });
      if (result.ok) {
        toast.success(t('shared', { name }));
        onOpenChange(false);
      } else setFailed(result.code === 'validation_failed' ? t('shareGone') : result.code === 'rate_limited' ? t('shareRateLimited') : result.code === 'not_allowed' ? t('shareNotAllowed') : t('failed'));
    } catch {
      setFailed(t('failed'));
    } finally {
      setPending(false);
    }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="sm:max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
      <DialogHeader><DialogTitle>{t('shareTitle', { name })}</DialogTitle><DialogDescription>{t('shareDescription', { name, min: SHARE_TIMES_MIN, max: SHARE_TIMES_MAX })}</DialogDescription></DialogHeader>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">{t('shareLegend')}</legend>
        {slots.map((slot) => {
          const checked = chosen.includes(slot.id);
          return <label key={slot.id} htmlFor={`${id}-${slot.id}`} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors', checked ? 'border-primary/50 bg-brand-soft/60' : 'border-foreground/[0.08] hover:bg-accent dark:border-white/[0.08]', !checked && chosen.length >= SHARE_TIMES_MAX && 'cursor-not-allowed opacity-60')}>
            <input id={`${id}-${slot.id}`} type="checkbox" checked={checked} disabled={!checked && chosen.length >= SHARE_TIMES_MAX} onChange={() => toggle(slot.id)} className="size-4 accent-[var(--primary)]" />
            <span className="min-w-0">
              <span className="block font-medium tabular-nums">{formatDate(slot.start)} · {formatTimeRange(slot.start, slot.end)}</span>
              <span className="block text-xs text-muted-foreground">{categories(slot.categorySlug)} · {slot.pricing.type === 'fixed' ? formatMoney(slot.pricing.priceCents) : t('hourly', { rate: formatMoney(slot.pricing.rateCents), hours: formatHours(slot.pricing.estimatedHours) })}</span>
            </span>
          </label>;
        })}
      </fieldset>
      <p className="text-xs text-muted-foreground">{t('shareChosen', { count: chosen.length, max: SHARE_TIMES_MAX, zone: zoneName })}</p>
      {failed && <p role="alert" className="text-sm text-destructive">{failed}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
        <Button type="button" disabled={!ready || pending} aria-busy={pending} onClick={() => void share()}>{pending ? <Spinner aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}{t('shareSend')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
