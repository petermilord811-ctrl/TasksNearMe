'use client';

import { useId } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type InviteHandlers, type InviteView, type ISODateTime, type PaymentAttemptResult } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { PriceBreakdown as PriceBreakdownTable } from '@/ui/components/money/price-breakdown';
import { OfferPrice } from '@/ui/components/offers/offer-parts';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useInviteStatus } from '@/ui/components/status/use-status';
import { Button } from '@/ui/primitives/button';
import { InviteActions } from './invite-actions';

export interface InviteCardProps { invite: InviteView; handlers: InviteHandlers; now: ISODateTime; headingLevel?: 2 | 3 }

export function InviteCard(props: InviteCardProps) { return <InviteCardContent {...props} />; }

/** Explicit starting states let previews exercise async and expanded controls without auto-submitting. */
export function InviteCardContent({ invite, handlers, now, headingLevel = 2, initialCounterOpen, initialResult, initialPending }: InviteCardProps & {
  initialCounterOpen?: boolean;
  initialResult?: PaymentAttemptResult;
  initialPending?: boolean;
}) {
  const { formatDate, formatDateTime, formatRelative, formatTimeRange } = useFormat();
  const t = useTranslations('inviteCard');
  const id = useId();
  const status = useInviteStatus(invite.status, invite.viewerRole, invite.helper.displayName);
  const other = invite.viewerRole === 'poster' ? invite.helper : invite.client;
  const counter = invite.status === 'countered' ? invite.counter : undefined;
  const open = invite.status === 'sent' || invite.status === 'countered';
  const released = ['declined', 'canceled', 'expired'].includes(invite.status);
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const detailHeadingLevel = headingLevel === 3 ? 4 : 3;

  function terms(value: InviteView['terms']) {
    return <div className="space-y-3">
      <p className="text-lg font-semibold"><OfferPrice pricing={value.pricing} /></p>
      <p className="flex items-start gap-2 text-sm"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="block text-muted-foreground">{t('start')}</span><time dateTime={value.start} className="tabular-nums">{formatDateTime(value.start)}</time></span></p>
      {value.message && <div className="space-y-1"><p className="text-sm text-muted-foreground">{t('message')}</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{value.message}</p></div>}
    </div>;
  }

  return <article aria-labelledby={`${id}-title`} className="min-w-0 space-y-5 rounded-[1.375rem] border border-foreground/[0.07] dark:border-white/[0.06] bg-card p-4 shadow-card sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <InitialsAvatar initials={other.initials} />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{t(invite.viewerRole === 'poster' ? 'toHelper' : 'fromClient', { name: other.displayName })}</p>
          <Heading id={`${id}-title`} className="font-heading text-lg/6 font-semibold"><Link href={invite.viewerRole === 'helper' ? routes.app.findWorkTask(invite.task.id) : routes.app.task(invite.task.id)} className="inline-flex min-h-11 items-center break-words rounded-md hover:text-primary hover:underline underline-offset-4">{invite.task.title}</Link></Heading>
        </div>
      </div>
      <StatusBadge {...status} />
    </div>
    {invite.slot && <p className="rounded-2xl bg-secondary/70 p-3 text-sm tabular-nums text-foreground dark:bg-secondary/40">{t(invite.viewerRole === 'helper' ? 'slotHelper' : 'slotClient', { date: formatDate(invite.slot.start), times: formatTimeRange(invite.slot.start, invite.slot.end), helper: invite.helper.displayName })}</p>}
    <div className="space-y-3"><p className="font-semibold">{t('terms')}</p>{terms(invite.terms)}</div>
    <PriceBreakdownTable flat breakdown={invite.breakdown} variant={invite.viewerRole} title={t('originalMoney')} headingLevel={detailHeadingLevel} />
    {counter && <section aria-label={t('counterTitle', { helper: invite.helper.displayName })} className="space-y-4 rounded-2xl border border-warning/40 bg-badge-warning/30 p-4">
      <p className="font-semibold">{t('counterTitle', { helper: invite.helper.displayName })}</p>
      {terms(counter)}
      <PriceBreakdownTable flat breakdown={counter.breakdown} variant={invite.viewerRole} title={t('counterMoney')} headingLevel={detailHeadingLevel} />
      {invite.viewerRole === 'poster' && <p className="text-sm leading-6">{t('counterTiming')}</p>}
    </section>}
    {invite.viewerRole === 'poster' && open && invite.authorizedCents !== undefined && <div className="space-y-2 rounded-2xl bg-secondary/70 p-4 text-foreground dark:bg-secondary/40">
      <p className="font-semibold tabular-nums">{t('held', { amount: formatMoney(invite.authorizedCents) })}</p>
      {invite.status === 'sent' && <p className="text-sm leading-6">{t('holdTiming', { helper: invite.helper.displayName })}</p>}
    </div>}
    {invite.expiresAt && <p className="text-sm text-muted-foreground"><time dateTime={invite.expiresAt} className="block tabular-nums">{t('expires', { at: formatDateTime(invite.expiresAt) })}</time><span>{formatRelative(invite.expiresAt, now)}</span></p>}
    {released && invite.viewerRole === 'poster' && <p className="text-sm text-muted-foreground">{t('holdReleased')}</p>}
    {invite.status === 'auth_failed' && invite.viewerRole === 'poster' && <p className="text-sm text-muted-foreground">{t('holdFailed')}</p>}
    {invite.status === 'accepted' && invite.bookingId && <Button asChild><Link href={routes.app.booking(invite.bookingId)}>{t('viewBooking')}</Link></Button>}
    <InviteActions invite={invite} handlers={handlers} headingLevel={detailHeadingLevel} initialCounterOpen={initialCounterOpen} initialResult={initialResult} initialPending={initialPending} />
  </article>;
}
