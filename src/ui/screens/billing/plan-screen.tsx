'use client';

import { useTransition } from 'react';
import { BadgeCheck, BarChart3, Check, CircleAlert, Crown, Info, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ActionResult, AiSearchAllowance, PlanAllowances, PlanCode, PlanHandlers, PlanInterval, PlanMembership, PlanOffer, PlanPageData } from '@/contracts';
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

const ICONS = { plus: Crown, pro: BarChart3 } as const;

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

function MembershipStatus({ membership }: { membership: PlanMembership }) {
  const t = useTranslations('plan');
  const { formatDate } = useFormat();
  const name = t(`plans.${membership.plan}.name`);
  // On hold (unpaid, paused): it doesn't count until a payment goes through; Manage fixes the card.
  if (membership.status === 'unpaid') return <div className="rounded-2xl bg-secondary/60 p-4 text-sm"><p className="flex items-start gap-2 font-medium text-destructive"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('current.unpaid', { plan: name })}</p></div>;
  return <div className="space-y-1.5 rounded-2xl bg-secondary/60 p-4 text-sm">
    {membership.status === 'past_due' && <p className="flex items-start gap-2 font-medium text-destructive"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('current.pastDue', { plan: name })}</p>}
    <p>{membership.cancelAtPeriodEnd ? t('current.ends', { date: formatDate(membership.periodEnd, { withYear: true }) }) : t('current.renews', { date: formatDate(membership.periodEnd, { withYear: true }), price: money(membership.priceCents) })}</p>
  </div>;
}

/** AI search a day and a month, or unlimited (Pro). */
function useAiLine() {
  const t = useTranslations('plan.allowances');
  return (ai: AiSearchAllowance) => (ai.perMonth === null && ai.perDay === null ? t('aiUnlimited') : ai.perDay === null ? t('aiMonth', { month: ai.perMonth ?? 0 }) : ai.perMonth === null ? t('aiDay', { day: ai.perDay }) : t('ai', { day: ai.perDay, month: ai.perMonth }));
}

/** A tier's numbers, one line each: AI search (where it's set up), new direct conversations, saved searches and alerts. */
function Allowances({ allowances, sparksMax, showAi }: { allowances: PlanAllowances; sparksMax?: number; showAi: boolean }) {
  const t = useTranslations('plan.allowances');
  const aiLine = useAiLine();
  return <>
    {/* AI search only where AI is set up (aa's sweep #8). */}
    {showAi && <li className="flex items-start gap-2.5"><Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{aiLine(allowances.aiSearches)}</li>}
    <li className="flex items-start gap-2.5"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />{sparksMax ? t('chatsSparks', { count: allowances.directChatsPerDay, max: sparksMax }) : t('chats', { count: allowances.directChatsPerDay })}</li>
    <li className="flex items-start gap-2.5"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />{t('searches', { searches: allowances.savedSearches, alerts: allowances.instantAlertsPerDay })}</li>
  </>;
}

function PlanCard({ offer, membership, data, handlers, showUsage }: { offer: PlanOffer; membership?: PlanMembership; data: PlanPageData; handlers: PlanHandlers; showUsage: boolean }) {
  const t = useTranslations('plan');
  const { pending, run } = useAction();
  const name = t(`plans.${offer.plan}.name`);
  const Icon = ICONS[offer.plan];
  // Plus is part of a Pro that renews; Pro over a renewing Plus is the upgrade (the plans' ladder, 2026-11-23).
  const included = offer.plan === 'plus' && data.plusIncluded === true && !membership;
  const upgrade = offer.plan === 'pro' && data.upgradesPlus === true;
  const subscribe = (interval: PlanInterval) => run(() => handlers.onSubscribe({ plan: offer.plan, interval }));
  const priceOf = (interval: PlanInterval) => money(interval === 'year' ? offer.yearlyCents : offer.monthlyCents);
  const action = (interval: PlanInterval) => t(`${upgrade ? 'upgrade' : 'subscribe'}.${interval}`);
  return <section aria-labelledby={`plan-${offer.plan}`} className={cn(cardClass, 'flex flex-col gap-5', membership && 'ring-2 ring-primary/40', offer.plan === 'pro' && !membership && 'border-amber-500/40')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{t(`plans.${offer.plan}.for`)}</p>
        <h2 id={`plan-${offer.plan}`} className="flex items-center gap-2 font-display text-2xl font-semibold tracking-[-0.02em]"><Icon aria-hidden="true" className="size-5 text-amber-600 dark:text-amber-400" />{name}</h2>
      </div>
      {membership && membership.status !== 'unpaid' && <Badge>{t('current.badge')}</Badge>}
      {included && <Badge variant="secondary">{t('included')}</Badge>}
    </div>
    <p className="tabular-nums"><span className="font-display text-3xl font-semibold tracking-[-0.02em]">{t('price.month', { price: money(offer.monthlyCents) })}</span> <span className="text-muted-foreground">{t('price.year', { price: money(offer.yearlyCents) })}</span></p>
    <ul className="space-y-2.5 text-[15px]">
      <li className="flex items-start gap-2.5 font-medium"><BadgeCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{t(`plans.${offer.plan}.everything`)}</li>
      {/* What the plan adds (LinkedIn-Premium-style since 2026-11-23: no service fees, so nothing is paid back). */}
      {(t.has(`plans.${offer.plan}.benefits`) ? Object.keys(t.raw(`plans.${offer.plan}.benefits`) as Record<string, string>) : []).map((key) => <li key={key} className="flex items-start gap-2.5"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />{t(`plans.${offer.plan}.benefits.${key}`)}</li>)}
      <Allowances allowances={offer} showAi={data.aiSearch.reason !== 'ai_off'} />
    </ul>
    {showUsage && <AiUsage data={data} />}
    {membership && <MembershipStatus membership={membership} />}
    <div className="mt-auto flex flex-wrap gap-2">
      {membership ? (
        <div className="space-y-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => run(handlers.onManage)}>{t('manage')}</Button>
          <p className="text-xs text-muted-foreground">{t('manageHint')}</p>
        </div>
      ) : included ? (
        <p className="text-sm text-muted-foreground">{t('includedNote')}</p>
      ) : data.confirming === offer.plan ? (
        // Paid, and Stripe's confirmation is on its way: no second checkout meanwhile (aa's sweep #1).
        <p role="status" className="text-sm text-muted-foreground">{t('current.confirming', { plan: name })}</p>
      ) : (
        !data.unavailable && <>
          {/* The name starts with the visible words, then says which plan and price (WCAG 2.5.3, aa's sweep #11). */}
          <Button type="button" disabled={pending} aria-label={t('subscribe.label', { action: action('month'), plan: name, price: t('price.month', { price: priceOf('month') }) })} onClick={() => subscribe('month')}>{action('month')}</Button>
          <Button type="button" variant="outline" disabled={pending} aria-label={t('subscribe.label', { action: action('year'), plan: name, price: t('price.yearOnly', { price: priceOf('year') }) })} onClick={() => subscribe('year')}>{action('year')}</Button>
          {upgrade && <p className="w-full text-xs text-muted-foreground">{t('upgrade.note')}</p>}
        </>
      )}
    </div>
  </section>;
}

/** The viewer's own AI searches now: today's or this month's, whichever runs out first; unlimited with Pro. */
function AiUsage({ data, className }: { data: PlanPageData; className?: string }) {
  const t = useTranslations('plan');
  const { formatDate } = useFormat();
  const ai = data.aiSearch;
  const renews = ai.resetsAt ? formatDate(ai.resetsAt) : '';
  return <p className={cn('rounded-2xl bg-secondary/60 p-4 text-sm tabular-nums', className)}>
    {ai.reason === 'ai_off'
      ? t('aiSearch.off')
      : ai.remaining === null
        ? t('aiSearch.unlimited')
        : ai.allowed
          ? ai.per === 'day' ? t('aiSearch.remainingToday', { count: ai.remaining }) : t('aiSearch.remaining', { count: ai.remaining, date: renews })
          : ai.per === 'day' ? t('aiSearch.usedToday') : t('aiSearch.used', { date: renews })}
  </p>;
}

/** Starter: free, with its numbers, and, while it's the viewer's tier, their AI searches. */
function StarterCard({ data, current }: { data: PlanPageData; current: boolean }) {
  const t = useTranslations('plan');
  const ai = data.aiSearch;
  return <section aria-labelledby="plan-free" className={cn(cardClass, 'flex flex-col gap-5', current && 'ring-2 ring-primary/40')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{t('starter.for')}</p>
        <h2 id="plan-free" className="flex items-center gap-2 font-display text-2xl font-semibold tracking-[-0.02em]"><Sparkles aria-hidden="true" className="size-5 text-primary" />{t('starter.name')}</h2>
      </div>
      {current && <Badge>{t('current.badge')}</Badge>}
    </div>
    <p><span className="font-display text-3xl font-semibold tracking-[-0.02em]">{t('starter.price')}</span> <span className="text-muted-foreground">{t('starter.always')}</span></p>
    <ul className="space-y-2.5 text-[15px]">
      {(['fees', 'pay'] as const).map((key) => <li key={key} className="flex items-start gap-2.5"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />{t(`starter.benefits.${key}`)}</li>)}
      <Allowances allowances={data.starter} sparksMax={data.starter.directChatsWithSparks} showAi={ai.reason !== 'ai_off'} />
    </ul>
    {current && <AiUsage data={data} className="mt-auto" />}
  </section>;
}

/** A former subscriber's invoices and card, on Stripe's portal (aa's sweep #7). */
function BillingHistory({ onManage }: { onManage: PlanHandlers['onManage'] }) {
  const t = useTranslations('plan');
  const { pending, run } = useAction();
  return <section aria-labelledby="plan-billing" className={cn(cardClass, 'flex flex-wrap items-center justify-between gap-3')}>
    <div className="min-w-0 space-y-1">
      <h2 id="plan-billing" className="text-lg font-semibold">{t('billing.title')}</h2>
      <p className="text-[15px] text-muted-foreground">{t('billing.body')}</p>
    </div>
    <Button type="button" variant="outline" disabled={pending} onClick={() => run(onManage)}>{t('billing.open')}</Button>
  </section>;
}

/**
 * The plans (completion plan 9.13; LinkedIn-Premium-style since 2026-11-23, a ladder since the owner's second change
 * that day): Starter (free), Plus and Pro side by side, each with everything in the one before and its numbers (AI
 * search a day and a month, new direct conversations, saved searches and instant alerts); Pro adds no hold fee and the
 * helper tools. Members see when it renews or ends, and manage it on Stripe's portal; a Plus member's Pro buttons
 * upgrade, and a Pro member's Plus shows as included. Plain terms close the page. Without Stripe here, the plans show
 * without buttons.
 */
export function PlanScreen({ data, handlers }: { data: PlanPageData; handlers: PlanHandlers }) {
  const t = useTranslations('plan');
  const memberOf = (plan: PlanCode) => data.memberships.find((membership) => membership.plan === plan);
  // The viewer's tier: the highest plan that counts (an unpaid one doesn't), or Starter. Their AI searches show there.
  const counting = new Set(data.memberships.filter((membership) => membership.status !== 'unpaid').map((membership) => membership.plan));
  const tier = counting.has('pro') ? 'pro' : counting.has('plus') ? 'plus' : 'free';
  return <div className="mx-auto w-full max-w-[1180px] space-y-6 lg:space-y-8">
    <PageHeader title={t('title')} description={t('description')} />
    {data.notice && <Alert role="status"><Info aria-hidden="true" /><AlertDescription className="text-foreground">{t(`notices.${data.notice}`)}</AlertDescription></Alert>}
    {data.unavailable && <Alert role="status"><Info aria-hidden="true" /><AlertDescription className="text-foreground">{t('unavailable')}</AlertDescription></Alert>}
    <div className="grid gap-4 lg:grid-cols-3">
      <StarterCard data={data} current={tier === 'free'} />
      {data.offers.map((offer) => <PlanCard key={offer.plan} offer={offer} membership={memberOf(offer.plan)} data={data} handlers={handlers} showUsage={tier === offer.plan} />)}
    </div>
    {data.portal && data.memberships.length === 0 && <BillingHistory onManage={handlers.onManage} />}
    <section aria-labelledby="plan-terms" className={cn(cardClass, 'space-y-3')}>
      <h2 id="plan-terms" className="text-lg font-semibold">{t('terms.title')}</h2>
      <ul className="space-y-2 text-[15px] text-muted-foreground">
        {(['cancel', 'switch', 'noTrial', 'price', 'trust'] as const).map((key) => <li key={key} className="flex items-start gap-2.5"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(`terms.${key}`)}</li>)}
      </ul>
    </section>
  </div>;
}
