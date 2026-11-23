'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowRight, CalendarClock, Check, ClipboardList, Repeat2, X } from 'lucide-react';
import { routes, type ChangeCard, type ISODateTime, type RequestCardHandlers, type TaskRequestCard } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Badge } from '@/ui/primitives/badge';
import { buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

const frame = 'w-full max-w-sm space-y-2.5 rounded-[1.25rem] border border-foreground/[0.08] bg-card px-4 py-3 text-left shadow-[0_1px_2px_rgb(23_18_14/0.05)] dark:border-white/[0.08]';
const link = 'inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline';

/** "$60" or "$25/hr · about 3 h (up to 4 h)". */
function usePrice() {
  const t = useTranslations('thread.cards');
  return (pricing: TaskRequestCard['pricing']) => pricing.type === 'fixed'
    ? formatMoney(pricing.priceCents)
    : t('hourly', { rate: formatMoney(pricing.rateCents), hours: formatHours(pricing.estimatedHours), cap: formatHours(pricing.hoursCap) });
}

/**
 * A task request in a direct conversation (2026-11-23, owner: "plan all and implement"): the task, when, the price and
 * where it stands now. The helper accepts or declines right here; the client can cancel while it waits.
 */
export function TaskRequestCardView({ card, name, handlers, onDone, createdAt }: {
  card: TaskRequestCard;
  /** The other person's first name. */
  name: string;
  handlers?: RequestCardHandlers;
  /** After an answer: the conversation reads again (the chat window; the page refreshes with the action). */
  onDone?: () => void;
  createdAt: ISODateTime;
}) {
  const t = useTranslations('thread.cards');
  const { formatDateTime, formatTime, zoneName } = useFormat();
  const price = usePrice();
  const [pending, setPending] = useState<'accept' | 'decline' | 'cancel' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function run(action: 'accept' | 'decline' | 'cancel') {
    const handler = action === 'accept' ? handlers?.onAccept : action === 'decline' ? handlers?.onDecline : handlers?.onCancel;
    if (!handler || pending) return;
    setPending(action);
    setFailed(null);
    try {
      const result = await handler({ inviteId: card.inviteId });
      if (result.ok) {
        toast.success(t(`done.${action}`));
        onDone?.();
      } else setFailed(result.code === 'expired' ? t('expiredNow') : result.code === 'not_allowed' || result.code === 'version_conflict' ? t('changedNow') : t('failed'));
    } catch {
      setFailed(t('failed'));
    } finally {
      setPending(null);
    }
  }

  const waiting = card.status === 'sent' || card.status === 'countered';
  return <article aria-label={t('request.label', { title: card.title })} className={frame}>
    <header className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><ClipboardList aria-hidden="true" className="size-3.5" />{t('request.kind')}</p>
      <Badge variant={card.status === 'accepted' ? 'default' : waiting ? 'secondary' : 'outline'}>{t(`request.status.${card.status}`, { name, role: card.viewerRole })}</Badge>
    </header>
    <h3 className="font-heading text-base leading-snug font-semibold [overflow-wrap:anywhere]">{card.title}</h3>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{t('when')}</dt>
      <dd className="tabular-nums">{formatDateTime(card.start)} <span className="text-muted-foreground">{zoneName}</span></dd>
      <dt className="text-muted-foreground">{t('price')}</dt>
      <dd className="tabular-nums">{price(card.pricing)}{card.status === 'countered' && <span className="text-muted-foreground"> · {t('request.counterNote', { name })}</span>}</dd>
    </dl>
    {card.expiresAt && <p className="text-xs text-muted-foreground tabular-nums">{t('answerBy', { time: formatTime(card.expiresAt), at: formatDateTime(card.expiresAt) })}</p>}
    {failed && <p role="alert" className="text-sm text-destructive">{failed}</p>}
    <div className="flex flex-wrap items-center gap-2 pt-0.5">
      {handlers && card.actions.includes('accept') && <button type="button" disabled={pending !== null} aria-busy={pending === 'accept'} onClick={() => void run('accept')} className={buttonVariants({ size: 'sm', className: 'min-h-10 rounded-full' })}>{pending === 'accept' ? <Spinner aria-hidden="true" /> : <Check aria-hidden="true" />}{t('request.accept')}</button>}
      {handlers && card.actions.includes('decline') && <button type="button" disabled={pending !== null} aria-busy={pending === 'decline'} onClick={() => void run('decline')} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'min-h-10 rounded-full' })}>{pending === 'decline' ? <Spinner aria-hidden="true" /> : <X aria-hidden="true" />}{t('request.decline')}</button>}
      {handlers && card.actions.includes('cancel') && <button type="button" disabled={pending !== null} aria-busy={pending === 'cancel'} onClick={() => void run('cancel')} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'min-h-10 rounded-full' })}>{pending === 'cancel' ? <Spinner aria-hidden="true" /> : <X aria-hidden="true" />}{t('request.cancel')}</button>}
      {card.bookingId
        ? <Link href={routes.app.booking(card.bookingId)} className={link}>{t('request.booking')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
        : <Link href={card.href} className={cn(link, 'ml-auto')}>{t(card.viewerRole === 'poster' ? 'request.task' : card.status === 'sent' ? 'request.counter' : 'request.details')}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
    </div>
    <p className="sr-only">{formatDateTime(createdAt)}</p>
  </article>;
}

/**
 * A booking change in the booking's conversation (2026-11-23): what changes, what it does to the price, and where it
 * stands. Review opens the change over the page (its dialog: accept, pay the difference, decline).
 */
export function ChangeCardView({ card, name, createdAt }: { card: ChangeCard; name: string; createdAt: ISODateTime }) {
  const t = useTranslations('thread.cards');
  const { formatDateTime, zoneName } = useFormat();
  const open = card.status === 'proposed' || card.status === 'accepted_pending_funding';
  return <article aria-label={t('change.label')} className={frame}>
    <header className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><Repeat2 aria-hidden="true" className="size-3.5" />{t(card.fromViewer ? 'change.fromYou' : 'change.fromThem', { name })}</p>
      <Badge variant={card.status === 'applied' ? 'default' : open ? 'secondary' : 'outline'}>{t(`change.status.${card.status}`)}</Badge>
    </header>
    <ul className="flex flex-wrap gap-1.5">{card.types.map((type) => <li key={type} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{t(`change.types.${type}`)}</li>)}</ul>
    {card.startAt && <p className="flex items-center gap-1.5 text-sm tabular-nums"><CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />{t('change.newTime', { time: formatDateTime(card.startAt) })} <span className="text-muted-foreground">{zoneName}</span></p>}
    <p className="text-sm tabular-nums text-muted-foreground">{card.differenceCents === 0 ? t('change.samePrice') : card.differenceCents > 0 ? t('change.more', { amount: formatMoney(card.differenceCents) }) : t('change.less', { amount: formatMoney(-card.differenceCents) })}</p>
    <Link href={routes.app.bookingChange(card.bookingId, card.changeId)} className={link}>{t(open && !card.fromViewer ? 'change.review' : 'change.view')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
    <p className="sr-only">{formatDateTime(createdAt)}</p>
  </article>;
}
