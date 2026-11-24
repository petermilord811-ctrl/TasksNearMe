'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CircleCheck, Contact, Info, LockKeyhole, MessagesSquare, Sparkles } from 'lucide-react';
import { routes, type ActionResult, type SparkPack, type SparksHandlers, type SparksPageData } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { PageHeader } from '@/ui/components/layout/page-header';
import { SparksBadge } from '@/ui/components/people/sparks-badge';
import { SparksMilestones } from '@/ui/components/people/sparks-milestones';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export interface SparksScreenProps {
  data: SparksPageData;
  handlers: SparksHandlers;
  /** Seeds for the preview gallery. */
  initialResult?: ActionResult;
  initialPendingPack?: SparkPack;
}

const card = 'rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]';

/**
 * `/app/sparks` (2026-11-21): the person's Sparks and level, what earns them, what each level allows (direct
 * conversations a day), and packs to buy. Says plainly what Sparks are not: they buy nothing, can't be cashed out and
 * never change search results, and others see the bought part beside the total.
 */
export function SparksScreen({ data, handlers, initialResult, initialPendingPack }: SparksScreenProps) {
  const t = useTranslations('sparks');
  const { formatDate } = useFormat();
  const router = useRouter();
  const locale = useLocale();
  const number = (value: number) => value.toLocaleString(locale === 'es' ? 'es-US' : 'en-US');
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  const [pendingPack, setPendingPack] = useState<SparkPack | undefined>(initialPendingPack);
  const { summary, nextLevel } = data;

  async function buy(pack: SparkPack) {
    if (pendingPack) return;
    setPendingPack(pack);
    setResult(undefined);
    let next: ActionResult;
    try {
      next = await handlers.onBuy({ pack });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    if (next.ok && next.redirectTo) {
      // Stripe's checkout is another site: a full navigation. Back here, the page reads the purchase.
      if (/^https?:\/\//.test(next.redirectTo)) window.location.assign(next.redirectTo);
      else {
        router.push(next.redirectTo);
        router.refresh();
        setPendingPack(undefined);
      }
      return;
    }
    setPendingPack(undefined);
    setResult(next);
  }

  return <div className="mx-auto w-full max-w-4xl space-y-6">
    <PageHeader title={t('title')} description={t('description')} />

    {data.notice && <Alert role="status" className={data.notice === 'purchased' ? 'border-success/30' : undefined}>
      {data.notice === 'purchased' ? <CircleCheck aria-hidden="true" className="text-success" /> : <Info aria-hidden="true" />}
      <AlertDescription className="text-foreground">{t(`notices.${data.notice}`)}</AlertDescription>
    </Alert>}

    <section aria-labelledby="sparks-total" className={cn(card, 'space-y-4')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 id="sparks-total" className="text-sm font-medium text-muted-foreground">{t('total.heading')}</h2>
          <p className="flex items-baseline gap-2 font-display text-4xl font-semibold tracking-[-0.02em] tabular-nums"><Sparkles aria-hidden="true" className="size-7 self-center text-sun" />{number(summary.total)}</p>
        </div>
        <SparksBadge sparks={summary} />
      </div>
      <p className="text-sm tabular-nums text-muted-foreground">{t('total.split', { earned: number(data.earned), bought: number(summary.bought) })}</p>
      <SparksMilestones levels={data.levels} total={summary.total} current={summary.level} className="border-t border-border pt-5" />
      {nextLevel
        ? <p className="text-sm font-medium tabular-nums">{t('total.toNext', { count: nextLevel.at - summary.total, level: t(`levels.${nextLevel.level}`) })}</p>
        : <p className="text-sm font-medium">{t('total.top')}</p>}
      <p className="flex items-start gap-2 text-sm"><MessagesSquare aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{t('total.allowance', { count: data.directChatsPerDay })}{data.yourPlanDirectChatsPerDay ? ` ${t('total.withPlan', { count: data.yourPlanDirectChatsPerDay })}` : ''}</span></p>
      <p className="text-sm text-muted-foreground">{t('planNote', { plus: data.planDirectChatsPerDay.plus, pro: data.planDirectChatsPerDay.pro })} <Link href={routes.app.plan()} className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{t('planLink')}</Link></p>
    </section>

    <div className="grid items-start gap-6 md:grid-cols-2">
      <section aria-labelledby="sparks-earn" className={cn(card, 'space-y-3')}>
        <h2 id="sparks-earn" className="font-display text-lg font-semibold">{t('earn.heading')}</h2>
        <ul className="divide-y divide-border text-sm">
          {data.rules.map((rule) => {
            const counted = data.breakdown.find((row) => row.source === rule.source);
            return <li key={rule.source} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block font-medium">{t(`earn.sources.${rule.source}`)}</span>
                <span className="block text-muted-foreground">{rule.dailyCap ? t('earn.pointsCapped', { points: rule.points, cap: rule.dailyCap }) : rule.perGiver ? t('earn.pointsPerGiver', { points: rule.points, cap: rule.perGiver }) : t('earn.points', { points: rule.points })}</span>
              </span>
              <span className="shrink-0 text-right tabular-nums">{t('earn.yours', { points: number(counted?.points ?? 0) })}</span>
            </li>;
          })}
        </ul>
        <p className="text-xs text-muted-foreground">{t('earn.giverNote', { days: data.giverMinAccountDays })}</p>
      </section>

      <section aria-labelledby="sparks-contact" className={cn(card, 'space-y-3')}>
        <h2 id="sparks-contact" className="flex items-center gap-2 font-display text-lg font-semibold"><Contact aria-hidden="true" className="size-5 text-primary" />{t('contact.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('contact.body')}</p>
        {data.helperContact.unlocked
          ? <p className="flex items-start gap-2 text-sm font-medium"><CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />{t('contact.unlocked', { earned: number(data.earned) })}</p>
          : <p className="flex items-start gap-2 text-sm tabular-nums"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{t('contact.progress', { earned: number(data.earned), at: number(data.helperContact.at) })}</p>}
      </section>
    </div>

    <section aria-labelledby="sparks-buy" className={cn(card, 'space-y-4')}>
      <div className="space-y-1">
        <h2 id="sparks-buy" className="font-display text-lg font-semibold">{t('buy.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('buy.description')}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {data.packs.map((pack) => <li key={pack.pack} className="flex flex-col gap-3 rounded-2xl border border-foreground/[0.08] p-4 dark:border-white/[0.08]">
          <p className="flex items-center gap-1.5 font-display text-2xl font-semibold tabular-nums"><Sparkles aria-hidden="true" className="size-5 text-sun" />{number(pack.points)}</p>
          <p className="text-sm tabular-nums text-muted-foreground">{formatMoney(pack.priceCents)}</p>
          {!data.unavailable && <Button type="button" variant={pack.pack === 'medium' ? 'default' : 'outline'} disabled={Boolean(pendingPack)} onClick={() => void buy(pack.pack)} className="mt-auto min-h-11">
            {pendingPack === pack.pack && <Spinner aria-hidden="true" className="size-4" />}
            {t('buy.action', { points: number(pack.points), price: formatMoney(pack.priceCents) })}
          </Button>}
        </li>)}
      </ul>
      {data.unavailable && <p className="text-sm text-muted-foreground">{t('buy.unavailable')}</p>}
      <FormFeedback result={result} />
      <p className="text-xs leading-5 text-muted-foreground">{t('buy.terms')}</p>
    </section>

    {data.purchases.length > 0 && <section aria-labelledby="sparks-history" className={cn(card, 'space-y-3')}>
      <h2 id="sparks-history" className="font-display text-lg font-semibold">{t('history.heading')}</h2>
      <ul className="divide-y divide-border text-sm">
        {data.purchases.map((purchase) => <li key={purchase.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span className="tabular-nums">{t('history.row', { points: number(purchase.points), price: formatMoney(purchase.priceCents), date: formatDate(purchase.createdAt) })}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', purchase.status === 'paid' ? 'bg-badge-success text-badge-success-foreground' : 'bg-badge-neutral text-badge-neutral-foreground')}>{t(`history.status.${purchase.status}`)}</span>
        </li>)}
      </ul>
    </section>}

    <p className="flex items-start gap-2 text-sm text-muted-foreground"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('whatTheyAre')}</p>
  </div>;
}
