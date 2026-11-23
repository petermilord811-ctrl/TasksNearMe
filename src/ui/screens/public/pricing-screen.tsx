import type { ReactNode } from 'react';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { BadgeCheck, BarChart3, Check, ChevronDown, Crown, HandCoins, MessagesSquare, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AiSearchAllowance, PlanAllowances, PlanTier, PricingPageData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatMoney } from '@/shared/format';
import { ClosingCta } from '@/ui/components/layout/closing-cta';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

export interface PricingScreenProps { data: PricingPageData }

const card = 'rounded-[1.375rem] border border-foreground/[0.07] bg-card p-5 shadow-card sm:p-6 dark:border-white/[0.06]';
const money = (cents: number) => formatMoney(cents).replace(/\.00$/, '');

/** One way to pay: what it costs, who pays it, how it goes, and the $60 desk worked out. */
function WayToPay({ kind, data }: { kind: 'direct' | 'held'; data: PricingPageData }) {
  const t = useTranslations('publicPages.pricing');
  const held = kind === 'held';
  const Icon = held ? ShieldCheck : HandCoins;
  const example = data.examples[kind];
  return <section aria-labelledby={`pay-${kind}`} className={cn(card, 'relative isolate flex flex-col gap-4 overflow-hidden', held && 'border-primary/25')}>
    {held && <span aria-hidden="true" className="pointer-events-none absolute -top-20 -right-16 -z-10 size-56 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]" />}
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-brand-soft text-primary"><Icon className="size-5" /></span>
      <h2 id={`pay-${kind}`} className="font-display text-xl font-semibold tracking-[-0.015em]">{t(`ways.${kind}.title`)}</h2>
    </div>
    <p className="flex items-baseline gap-2"><span className="font-display text-4xl font-semibold tracking-[-0.03em] tabular-nums">{held ? t('ways.held.price', { percent: data.holdFee.percent }) : t('ways.direct.price')}</span><span className="text-sm text-muted-foreground">{held ? t('ways.held.priceNote', { minimum: formatMoney(data.holdFee.minimumCents) }) : t('ways.direct.priceNote')}</span></p>
    <ul className="space-y-2 text-[0.9375rem]">
      {(['one', 'two', 'three'] as const).map((point) => <li key={point} className="flex items-start gap-2.5"><Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" />{t(`ways.${kind}.${point}`)}</li>)}
    </ul>
    <p className="mt-auto rounded-2xl bg-secondary/60 p-3.5 text-sm tabular-nums dark:bg-secondary/30">{held
      ? t('ways.held.example', { price: formatMoney(example.taskPriceCents), total: formatMoney(example.posterTotalCents), fee: formatMoney(example.posterFeeCents), earns: formatMoney(example.helperEarningsCents) })
      : t('ways.direct.example', { price: formatMoney(example.taskPriceCents) })}</p>
  </section>;
}

const PLAN_ICONS = { free: Sparkles, plus: Crown, pro: BarChart3 } as const;

/** Which words say an AI search allowance: a day and a month, one of them, or unlimited (Pro). */
function aiKey(ai: AiSearchAllowance): 'ai' | 'aiDay' | 'aiMonth' | 'aiUnlimited' {
  return ai.perMonth === null ? (ai.perDay === null ? 'aiUnlimited' : 'aiDay') : ai.perDay === null ? 'aiMonth' : 'ai';
}

/**
 * Starter, Plus and Pro side by side (LinkedIn-Premium-style, 2026-11-23; a ladder since the owner's second change that
 * day): who each is for, its price, and what it adds to the one before, with its numbers.
 */
function Plans({ data }: { data: PricingPageData }) {
  const t = useTranslations('publicPages.pricing.plans');
  const allowance = useTranslations('publicPages.pricing.allowances');
  const plan = useTranslations('plan');
  // Only where subscribing works (Stripe, or the stand-in): elsewhere there's nothing to compare Starter with.
  if (!data.plans?.length) return null;
  const tiers: { code: PlanTier; allowances: PlanAllowances; monthlyCents?: number; yearlyCents?: number }[] = [{ code: 'free', allowances: data.starter }, ...data.plans.map((offer) => ({ code: offer.plan, allowances: offer, monthlyCents: offer.monthlyCents, yearlyCents: offer.yearlyCents }))];
  const line = (key: string, text: ReactNode, Icon = BadgeCheck) => <li key={key} className="flex items-start gap-2.5"><Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{text}</span></li>;
  return <Section title={t('title')}>
    <p className="max-w-reading text-muted-foreground">{t('intro')}</p>
    <div className={cn('grid gap-4', tiers.length === 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2')}>
      {tiers.map(({ code, allowances, monthlyCents, yearlyCents }) => {
        const Icon = PLAN_ICONS[code];
        const featured = code === 'pro';
        const benefits = t.raw(`${code}.benefits`) as Record<string, string>;
        return <section key={code} aria-labelledby={`plan-${code}`} className={cn(card, 'flex flex-col gap-4', featured && 'border-amber-500/40 shadow-[0_24px_50px_-30px_rgb(180_83_9/0.55)]')}>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t(`${code}.for`)}</p>
            <h3 id={`plan-${code}`} className="flex items-center gap-2 font-display text-2xl font-semibold tracking-[-0.02em]"><Icon aria-hidden="true" className={cn('size-5', code === 'free' ? 'text-primary' : 'text-amber-600 dark:text-amber-400')} />{t(`${code}.name`)}</h3>
          </div>
          <p className="tabular-nums">{monthlyCents !== undefined && yearlyCents !== undefined
            ? <><span className="font-display text-3xl font-semibold">{money(monthlyCents)}</span><span className="text-muted-foreground"> {t('perMonth')}</span><span className="block text-sm text-muted-foreground">{plan('price.year', { price: money(yearlyCents) })}</span></>
            : <><span className="font-display text-3xl font-semibold">{money(0)}</span><span className="block text-sm text-muted-foreground">{t('free.always')}</span></>}</p>
          <ul className="space-y-2.5 text-[0.9375rem]">
            {Object.keys(benefits).map((key) => line(key, t(`${code}.benefits.${key}`, { percent: data.holdFee.percent })))}
            {line('ai', allowance(aiKey(allowances.aiSearches), { day: allowances.aiSearches.perDay ?? 0, month: allowances.aiSearches.perMonth ?? 0 }), Sparkles)}
            {line('chats', code === 'free' ? allowance('chatsSparks', { count: allowances.directChatsPerDay, max: data.starter.directChatsWithSparks }) : allowance('chats', { count: allowances.directChatsPerDay }), MessagesSquare)}
            {line('searches', allowance('searches', { searches: allowances.savedSearches, alerts: allowances.instantAlertsPerDay }))}
          </ul>
          <Link href={code === 'free' ? routes.signUp() : routes.app.plan()} className={cn(buttonVariants({ variant: code === 'free' ? 'outline' : 'default' }), 'mt-auto w-full')}>{t(`${code}.cta`)}</Link>
        </section>;
      })}
    </div>
  </Section>;
}

/** What each tier has, row by row. */
function Compare({ data }: { data: PricingPageData }) {
  const t = useTranslations('publicPages.pricing.compare');
  if (!data.plans?.length) return null;
  const tiers: { code: PlanTier; allowances: PlanAllowances }[] = [{ code: 'free', allowances: data.starter }, ...data.plans.map((offer) => ({ code: offer.plan, allowances: offer }))];
  const yes = <Check aria-label={t('yes')} className="mx-auto size-5 text-success" />;
  const no = <X aria-label={t('no')} className="mx-auto size-4 text-muted-foreground" />;
  const pro = (code: PlanTier) => (code === 'pro' ? yes : no);
  const rows: { key: string; cell: (tier: (typeof tiers)[number]) => ReactNode }[] = [
    { key: 'serviceFees', cell: () => t('none') },
    { key: 'direct', cell: () => yes },
    { key: 'holdFee', cell: ({ code }) => (code === 'pro' ? t('waived') : t('holdFee', { percent: data.holdFee.percent })) },
    { key: 'ai', cell: ({ allowances: { aiSearches } }) => t(aiKey(aiSearches), { day: aiSearches.perDay ?? 0, month: aiSearches.perMonth ?? 0 }) },
    { key: 'chats', cell: ({ code, allowances }) => (code === 'free' ? t('chatsSparks', { count: allowances.directChatsPerDay, max: data.starter.directChatsWithSparks }) : allowances.directChatsPerDay) },
    { key: 'firstMessages', cell: () => data.directFirstMessages },
    { key: 'savedSearches', cell: ({ allowances }) => allowances.savedSearches },
    { key: 'alerts', cell: ({ allowances }) => allowances.instantAlertsPerDay },
    { key: 'offersFirst', cell: ({ code }) => pro(code) },
    { key: 'badge', cell: ({ code }) => pro(code) },
    { key: 'insights', cell: ({ code }) => pro(code) },
  ];
  // On phones the table scrolls sideways: the feature names stay put beside Plus and Pro.
  const pinned = 'sticky left-0 z-10 w-[38%] bg-card sm:static sm:w-auto';
  return <Section title={t('title')}>
    <div className="overflow-x-auto rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]">
      <table className="w-full min-w-[36rem] text-sm">
        <thead><tr className="border-b border-foreground/[0.07] dark:border-white/[0.06]"><th scope="col" className={cn(pinned, 'p-4 text-left font-medium text-muted-foreground')}>{t('feature')}</th>{tiers.map(({ code }) => <th key={code} scope="col" className="p-4 text-center font-display text-base font-semibold">{t(`plan.${code}`)}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key} className="border-b border-foreground/[0.05] last:border-0 dark:border-white/[0.05]"><th scope="row" className={cn(pinned, 'p-4 text-left font-medium')}>{t(`rows.${row.key}`)}</th>{tiers.map((tier) => <td key={tier.code} className="p-4 text-center tabular-nums">{row.cell(tier)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </Section>;
}

/**
 * Direct messages (owner, 2026-11-23: "Describe direct message limit"): who can be messaged, how many new conversations
 * a day each tier starts, the messages before an answer, and what stays private.
 */
function DirectMessages({ data }: { data: PricingPageData }) {
  const t = useTranslations('publicPages.pricing.messages');
  const plus = data.plans?.find((offer) => offer.plan === 'plus');
  const pro = data.plans?.find((offer) => offer.plan === 'pro');
  const starter = { count: data.starter.directChatsPerDay, max: data.starter.directChatsWithSparks };
  return <Section title={t('title')}>
    <div className={cn(card, 'max-w-reading space-y-3')}>
      <p>{plus && pro ? t('daily', { ...starter, plus: plus.directChatsPerDay, pro: pro.directChatsPerDay }) : t('dailyStarter', starter)}</p>
      <ul className="space-y-2 text-[0.9375rem] text-muted-foreground">
        {(['first', 'replies', 'choose', 'private'] as const).map((key) => <li key={key} className="flex items-start gap-2.5"><Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" />{t(key, { first: data.directFirstMessages })}</li>)}
      </ul>
    </div>
  </Section>;
}

/**
 * `/pricing` (rewritten 2026-11-23, owner: "Totally remove service fee feature … Change the pricing page totally …
 * deep think about subscription plan (as linkedin premium)", then "Make AI search for limit for starter … Pro only no
 * fee. Describe direct message limit"): no service fees; pay directly for free, or have TasksNearMe hold the payment
 * for a small fee the client pays (free with Pro); Starter, Plus and Pro as a ladder, compared row by row; direct
 * messages' limits; how a held payment works, the cancellation rule for held bookings, and the questions people ask.
 * Numbers come from the published policy and the plans' allowances.
 */
export function PricingScreen({ data }: PricingScreenProps) {
  const t = useTranslations('publicPages.pricing');
  const steps = ['book', 'work', 'done', 'paid'] as const;
  return <div className="space-y-section">
    <PageHeader title={t('title')} description={t('description')} />

    <div className="grid gap-4 md:grid-cols-2">
      <WayToPay kind="direct" data={data} />
      <WayToPay kind="held" data={data} />
    </div>

    <Section title={t('how.title')}>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => <li key={step} className={cn(card, 'space-y-2')}>
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular-nums">{index + 1}</span>
          <h3 className="font-semibold">{t(`how.${step}.title`)}</h3>
          <p className="text-sm text-muted-foreground">{t(`how.${step}.body`, { hours: data.timers.autoApproveHours })}</p>
        </li>)}
      </ol>
    </Section>

    <Plans data={data} />
    <Compare data={data} />
    <DirectMessages data={data} />

    <Section title={t('cancellation.title')}>
      <p className={cn(card, 'max-w-reading')}>{t('cancellation.body', { hours: data.cancellation.freeUntilHours, percent: data.cancellation.lateFeePercent, minimum: formatMoney(data.cancellation.lateFeeMinimumCents) })}{' '}<Link href={routes.legal('cancellation-policy')} className="font-medium text-primary underline underline-offset-4">{t('cancellation.link')}</Link></p>
    </Section>

    <Section title={t('faq.title')}>
      <div className="space-y-3">
        {(['why', 'which', 'safe', 'when', 'fee', 'aiSearch', 'cancelPlan'] as const).map((question) => <details key={question} className="group rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-[1.375rem] px-5 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">{t(`faq.${question}.q`)}<ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary>
          <p className="px-5 pb-5 text-muted-foreground">{t(`faq.${question}.a`, { percent: data.holdFee.percent, day: data.starter.aiSearches.perDay ?? 0, month: data.starter.aiSearches.perMonth ?? 0 })}</p>
        </details>)}
      </div>
    </Section>

    <ClosingCta title={t('closing.title')} body={t('closing.body')} action={{ href: routes.app.newTask(), label: t('closing.action') }} />
  </div>;
}
