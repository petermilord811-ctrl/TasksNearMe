'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowRight, MessagesSquare, UsersRound } from 'lucide-react';
import { routes, type ISODateTime, type TeamActionId, type TeamBar, type TeamHandlers, type TeamInviteCard } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link, localeHref } from '@/ui/lib/locale-link';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { cn } from '@/ui/lib/utils';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

const frame = 'w-full max-w-sm space-y-2.5 rounded-[1.25rem] border border-foreground/[0.08] bg-card px-4 py-3 text-left shadow-[0_1px_2px_rgb(23_18_14/0.05)] dark:border-white/[0.08]';
const link = 'inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline';

const first = (name: string) => name.split(' ')[0] || name;

/** "$60" or "$25/hr · about 3 h (up to 4 h)". */
function usePrice() {
  const t = useTranslations('thread.cards');
  return (pricing: NonNullable<TeamInviteCard['pricing']>) => pricing.type === 'fixed'
    ? formatMoney(pricing.priceCents)
    : t('hourly', { rate: formatMoney(pricing.rateCents), hours: formatHours(pricing.estimatedHours), cap: formatHours(pricing.hoursCap) });
}

/**
 * A team invite (2026-11-24): in the two helpers' conversation (the partner answers there) and in the lead's booking
 * conversation (the client confirms there), and on the booking page. Only the actions the server offers the viewer.
 */
export function TeamInviteCardView({ card, handlers, onDone, createdAt, embedded = false }: {
  card: TeamInviteCard;
  handlers?: TeamHandlers;
  /** After an answer: the conversation reads again (the chat window; the page refreshes with the action). */
  onDone?: () => void;
  createdAt?: ISODateTime;
  /** On the booking page: no card frame of its own. */
  embedded?: boolean;
}) {
  return <TimeZoneProvider timeZone={card.timeZone}><TeamCard card={card} {...(handlers ? { handlers } : {})} {...(onDone ? { onDone } : {})} {...(createdAt ? { createdAt } : {})} embedded={embedded} /></TimeZoneProvider>;
}

function TeamCard({ card, handlers, onDone, createdAt, embedded }: { card: TeamInviteCard; handlers?: TeamHandlers; onDone?: () => void; createdAt?: ISODateTime; embedded: boolean }) {
  const t = useTranslations('teams.card');
  const { formatDateTime, formatTime, zoneName } = useFormat();
  const price = usePrice();
  const router = useRouter();
  const locale = useLocale();
  const [pending, setPending] = useState<TeamActionId | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const lead = first(card.lead.displayName);
  const partner = first(card.partner.displayName);
  const names = { lead, partner };
  // The lead never sees the partner's booking: for them a confirmed part reads as on the team.
  const booking = card.status === 'confirmed' && !card.partnerBooking && card.viewerRole !== 'lead';
  const statusKey = card.partnerBooking?.status === 'canceled' ? 'partnerCanceled' : booking ? 'booking' : card.status;
  const status = card.viewerRole === 'client' ? t(`statusClient.${statusKey}`, names) : t(`status.${statusKey}`, names);
  const tone = card.status === 'confirmed' ? 'success' : card.status === 'invited' || card.status === 'accepted' ? 'info' : 'neutral';
  const headline = card.viewerRole === 'partner'
    ? t('invitedYou', names)
    : card.viewerRole === 'lead'
      ? t('youInvited', names)
      : card.pricing ? t('proposed', { ...names, price: price(card.pricing) }) : t('proposedNoPrice', names);

  async function run(action: TeamActionId) {
    if (!handlers || pending) return;
    setPending(action);
    setFailed(null);
    try {
      const result = await handlers.onAction({ teamId: card.teamId, action });
      if (result.ok) {
        if (result.redirectTo) router.push(localeHref(result.redirectTo, locale), { scroll: false });
        else {
          toast.success(t(`done.${action}`));
          onDone?.();
        }
      } else setFailed(result.code === 'expired' ? t('expiredNow') : result.code === 'not_allowed' || result.code === 'not_found' ? t('changedNow') : t('failed'));
    } catch {
      setFailed(t('failed'));
    } finally {
      setPending(null);
    }
  }

  const destructive: TeamActionId[] = ['decline', 'withdraw', 'cancel', 'refuse'];
  return <article data-team-card={card.status} aria-label={t('title')} className={embedded ? 'space-y-2.5' : frame}>
    <header className="flex items-start justify-between gap-3">
      <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><UsersRound aria-hidden="true" className="size-3.5 shrink-0" />{t('title')}</p>
      <Badge variant="outline" data-tone={tone} className={cn('shrink-0', tone === 'success' && 'border-success/40 text-success', tone === 'info' && 'border-info/40 text-info')}>{status}</Badge>
    </header>
    <p className="font-medium [overflow-wrap:anywhere]">{headline}</p>
    <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{card.title}</p>
    <p className="text-sm tabular-nums"><time dateTime={card.start}>{formatDateTime(card.start)}</time> <span className="text-muted-foreground">{zoneName}</span></p>
    <p className="text-sm text-muted-foreground">{t('people', { lead: card.lead.displayName, partner: card.partner.displayName })}</p>
    {card.pricing && card.viewerRole !== 'client' && <p className="text-sm font-semibold tabular-nums">{card.viewerRole === 'partner' ? t('part', { price: price(card.pricing) }) : t('partFor', { price: price(card.pricing), partner })}</p>}
    {card.pricing && <p className="text-xs text-muted-foreground">{card.paymentMode === 'direct' ? t('paidDirectly', names) : t('paidUpfront', names)}</p>}
    {card.note && <blockquote className="border-l-2 border-primary/40 pl-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"><span className="sr-only">{t('note', names)}: </span>{card.note}</blockquote>}
    {card.partnerBooking && <Link href={routes.app.booking(card.partnerBooking.bookingId)} className={link}>{t('viewBooking', { partner })}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
    {handlers && card.actions.length > 0 && <div className="flex flex-wrap gap-2 pt-1">
      {card.actions.map((action) => <Button key={action} type="button" size="sm" variant={destructive.includes(action) ? 'outline' : 'default'} className="min-h-11 rounded-full sm:min-h-9" disabled={pending !== null} aria-busy={pending === action} onClick={() => void run(action)}>
        {pending === action && <Spinner aria-hidden="true" />}{t(`actions.${action}`, names)}
      </Button>)}
    </div>}
    {failed && <p role="alert" className="text-sm text-destructive">{failed}</p>}
    {createdAt && <p className="text-xs text-muted-foreground tabular-nums"><time dateTime={createdAt}>{formatTime(createdAt)}</time></p>}
  </article>;
}

/**
 * "Team: Jordan (lead) and Sam" on top of a team job's conversations (2026-11-24), with the viewer's other team
 * conversations: they open in place (the Messages pane beside the list, or the chat window).
 */
export function TeamBarView({ bar, compact = false }: { bar: TeamBar; compact?: boolean }) {
  const t = useTranslations('teams.bar');
  const names = { lead: first(bar.lead.displayName), partner: first(bar.partner.displayName) };
  return <nav aria-label={t('label', names)} data-team-bar className={cn('flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-foreground/[0.07] bg-brand-soft/35 dark:border-white/[0.06] dark:bg-white/[0.03]', compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm')}>
    <p className="flex min-w-0 items-center gap-1.5 font-medium"><UsersRound aria-hidden="true" className="size-4 shrink-0 text-primary" /><span className="truncate">{t('label', names)}</span></p>
    <ul className="flex flex-wrap items-center gap-2">
      {bar.conversations.map((item) => <li key={item.threadId}>
        {item.current
          ? <span aria-current="page" className={cn('inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 font-semibold dark:bg-white/[0.08]', compact ? 'min-h-7' : 'min-h-9')}>{t(item.kind, names)}</span>
          : <Link href={routes.app.thread(item.threadId)} replace scroll={false} className={cn('inline-flex items-center gap-1 rounded-full border border-primary/35 px-2.5 font-semibold text-primary hover:bg-brand-soft', compact ? 'min-h-7' : 'min-h-11 sm:min-h-9')}><MessagesSquare aria-hidden="true" className="size-3.5" />{t(item.kind, names)}</Link>}
      </li>)}
    </ul>
  </nav>;
}
