'use client';

import { useTransition } from 'react';
import { Check, CircleAlert, Info, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ActionResult, PlanCode, PlanHandlers, PlanInterval, PlanMembership, PlanOffer, PlanPageData } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';

const cardClass = 'rounded-[1.375rem] border border-foreground/[0.07] bg-card p-5 shadow-card sm:p-6 dark:border-white/[0.06]';

/** "$4.99", "$40" (whole dollars without cents). */
const money = (cents: number) => formatMoney(cents).replace(/\.00$/, '');

function useAction() {
  const t = useTranslations('plan');
  const [pending, startTransition] = useTransition();
  const run = (call: () => Promise<ActionResult>) =>
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await call();
      } catch {
        result = { ok: false, code: 'unknown' };
      }
      // Checkout and the portal are Stripe's own pages: a full page load.
      if (result.ok && result.redirectTo) window.location.assign(result.redirectTo);
      else if (!result.ok) toast.error(t('error'));
    });
  return { pending, run };
}

function MembershipStatus({ membership, offer }: { membership: PlanMembership; offer: PlanOffer }) {
  const t = useTranslations('plan');
  const { formatDate } = useFormat();
  const name = t(`plans.${membership.plan}.name`);
  return <div className="space-y-1.5 rounded-2xl bg-secondary/60 p-4 text-sm">
    {membership.status === 'past_due' && <p className="flex items-start gap-2 font-medium text-destructive"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('current.pastDue', { plan: name })}</p>}
    <p>{membership.cancelAtPeriodEnd ? t('current.ends', { date: formatDate(membership.periodEnd, { withYear: true }) }) : t('current.renews', { date: formatDate(membership.periodEnd, { withYear: true }), price: money(membership.priceCents) })}</p>
    <p className="tabular-nums text-muted-foreground">{t('current.rebated', { amount: money(membership.rebatedThisMonthCents), cap: money(offer.rebateMonthlyCapCents) })}</p>
  </div>;
}

function PlanCard({ offer, membership, estimate, data, handlers }: { offer: PlanOffer; membership?: PlanMembership; estimate?: PlanPageData['estimates'][number]; data: PlanPageData; handlers: PlanHandlers }) {
  const t = useTranslations('plan');
  const locale = useLocale();
  const { pending, run } = useAction();
  const name = t(`plans.${offer.plan}.name`);
  const share = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(offer.rebateBps / 10_000);
  const subscribe = (interval: PlanInterval) => run(() => handlers.onSubscribe({ plan: offer.plan, interval }));
  const priceOf = (interval: PlanInterval) => money(interval === 'year' ? offer.yearlyCents : offer.monthlyCents);
  return <section aria-labelledby={`plan-${offer.plan}`} className={cn(cardClass, 'flex flex-col gap-5', membership && 'ring-2 ring-primary/40')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{t(`plans.${offer.plan}.for`)}</p>
        <h2 id={`plan-${offer.plan}`} className="font-display text-2xl font-semibold tracking-[-0.02em]">{name}</h2>
      </div>
      {membership && <Badge>{t('current.badge')}</Badge>}
    </div>
    <p className="tabular-nums"><span className="font-display text-3xl font-semibold tracking-[-0.02em]">{t('price.month', { price: money(offer.monthlyCents) })}</span> <span className="text-muted-foreground">{t('price.year', { price: money(offer.yearlyCents) })}</span></p>
    <ul className="space-y-2.5 text-[15px]">
      <li className="flex items-start gap-2.5"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />{t(`plans.${offer.plan}.rebate`, { share, cap: money(offer.rebateMonthlyCapCents) })}</li>
      <li className="flex items-start gap-2.5"><Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{t(`plans.${offer.plan}.ai`, { count: offer.aiSearchesPerMonth })}</li>
    </ul>
    <p className="text-sm text-muted-foreground">{t(`plans.${offer.plan}.breakEven`, { amount: money(offer.breakEvenMonthlyCents) })}</p>
    {estimate && <p className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-3 text-sm tabular-nums">{t(`estimate.${offer.plan}`, { count: estimate.bookings, amount: money(estimate.savedCents) })}</p>}
    {membership && <MembershipStatus membership={membership} offer={offer} />}
    <div className="mt-auto flex flex-wrap gap-2">
      {membership ? (
        <div className="space-y-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => run(handlers.onManage)}>{t('manage')}</Button>
          <p className="text-xs text-muted-foreground">{t('manageHint')}</p>
        </div>
      ) : (
        !data.unavailable && <>
          <Button type="button" disabled={pending} aria-label={t('subscribe.label', { plan: name, price: t('price.month', { price: priceOf('month') }) })} onClick={() => subscribe('month')}>{t('subscribe.month')}</Button>
          <Button type="button" variant="outline" disabled={pending} aria-label={t('subscribe.label', { plan: name, price: priceOf('year') })} onClick={() => subscribe('year')}>{t('subscribe.year')}</Button>
        </>
      )}
    </div>
  </section>;
}

/**
 * The optional plans (completion plan 9.13): each with its price, what it adds (money back on fees, capped a month,
 * and AI search), an honest break-even and, from the person's own last 30 days, what it would have paid back. Members
 * see when it renews or ends and what it paid back this month, and manage it on Stripe's portal. Plain terms close the
 * page. Without Stripe here, the plans show without buttons.
 */
export function PlanScreen({ data, handlers }: { data: PlanPageData; handlers: PlanHandlers }) {
  const t = useTranslations('plan');
  const { formatDate } = useFormat();
  const memberOf = (plan: PlanCode) => data.memberships.find((membership) => membership.plan === plan);
  return <div className="mx-auto w-full max-w-[960px] space-y-6 lg:space-y-8">
    <PageHeader title={t('title')} description={t('description')} />
    {data.notice && <Alert role="status"><Info aria-hidden="true" /><AlertDescription className="text-foreground">{t(`notices.${data.notice}`)}</AlertDescription></Alert>}
    {data.unavailable && <Alert role="status"><Info aria-hidden="true" /><AlertDescription className="text-foreground">{t('unavailable')}</AlertDescription></Alert>}
    <div className="grid gap-4 md:grid-cols-2">
      {data.offers.map((offer) => <PlanCard key={offer.plan} offer={offer} membership={memberOf(offer.plan)} estimate={data.estimates.find((estimate) => estimate.plan === offer.plan)} data={data} handlers={handlers} />)}
    </div>
    <section aria-labelledby="plan-free" className={cn(cardClass, 'space-y-2')}>
      <h2 id="plan-free" className="text-lg font-semibold">{t('free.title')}</h2>
      <p className="text-[15px] text-muted-foreground">{t('free.body', { count: data.freeAiSearchesPerMonth })}</p>
      <p className="text-sm tabular-nums">
        {data.aiSearch.reason === 'ai_off'
          ? t('aiSearch.off')
          : data.aiSearch.allowed
            ? t('aiSearch.remaining', { count: data.aiSearch.remaining ?? 0, date: data.aiSearch.resetsAt ? formatDate(data.aiSearch.resetsAt) : '' })
            : t('aiSearch.used', { date: data.aiSearch.resetsAt ? formatDate(data.aiSearch.resetsAt) : '' })}
      </p>
    </section>
    <section aria-labelledby="plan-terms" className={cn(cardClass, 'space-y-3')}>
      <h2 id="plan-terms" className="text-lg font-semibold">{t('terms.title')}</h2>
      <ul className="space-y-2 text-[15px] text-muted-foreground">
        {(['cancel', 'noTrial', 'price', 'trust', 'rebates'] as const).map((key) => <li key={key} className="flex items-start gap-2.5"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(`terms.${key}`)}</li>)}
      </ul>
    </section>
  </div>;
}
