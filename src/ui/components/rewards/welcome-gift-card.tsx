import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ArrowRight, Circle, CircleCheck, CircleDashed, Clock, Gift, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { OnboardingStepState, WelcomeGiftCard } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

/** "$50": a gift card's amount reads whole. */
const giftAmount = (cents: number) => formatMoney(cents).replace(/\.00$/, '');

/**
 * The $50 welcome gift card (blueprint 05 §2, the owner's rule of 2026-11-14): every helper earns it once their
 * phone, ID and background checks pass. `WelcomeGiftCardView` is the full card (the profile's first page, the
 * rewards page, onboarding's last step, the become-a-helper page's preview); `WelcomeGiftStrip` is the one-line
 * version under onboarding's stepper ("Phone ✓ · ID · Background → $50 gift card"). Both show what they receive:
 * the server decides the state and each check's state.
 */

const CHECK_ICON: Record<OnboardingStepState, ReactNode> = {
  done: <CircleCheck className="text-success" />,
  in_review: <Clock className="text-info" />,
  current: <Circle className="text-primary" />,
  todo: <Circle className="text-badge-reward-foreground/60" />,
  locked: <Lock className="text-badge-reward-foreground/60" />,
  skipped: <Circle className="text-badge-reward-foreground/60" />,
  // Waits for the helper's city to open (national, cities in turn); none of the gift card's checks do today.
  later: <CircleDashed className="text-badge-reward-foreground/60" />,
};

/** The onboarding step to continue with: the first check not done (its step), else the setup's start. */
function nextCheckHref(card: WelcomeGiftCard): string {
  const next = card.checks.find((entry) => entry.state !== 'done' && entry.state !== 'locked');
  return routes.app.helperOnboarding(next ? next.check : undefined);
}

/** The gift card itself, drawn as a card: the amount on the brand's iridescent light. Decorative. */
function GiftCardArt({ amountCents, state }: { amountCents: number; state: WelcomeGiftCard['state'] }) {
  const t = useTranslations('rewards.welcomeCard');
  return <div aria-hidden="true" className={cn(
    'relative isolate grid aspect-[1.586] w-full max-w-56 shrink-0 overflow-hidden rounded-2xl p-4 text-white shadow-[0_18px_40px_-18px_rgb(80_40_140/0.55)] transition-transform duration-500 ease-[var(--ease-out)] motion-safe:group-hover/gift:-rotate-2 motion-safe:group-hover/gift:-translate-y-0.5',
    state === 'open' && 'saturate-[0.85]',
  )} style={{ backgroundImage: 'var(--iridescent)' }}>
    <span className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_20%_0%,rgb(255_255_255/0.45),transparent_55%)]" />
    <span className="pointer-events-none absolute -right-6 -bottom-8 -z-10 size-28 rounded-full border-[10px] border-white/25" />
    <div className="flex items-start justify-between gap-2">
      <Gift className="size-5" />
      <span className="text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">{t('artLabel')}</span>
    </div>
    <p className="self-end font-display text-4xl leading-none font-semibold tracking-[-0.04em] tabular-nums">{giftAmount(amountCents)}</p>
  </div>;
}

export function WelcomeGiftCardView({ card, headingLevel = 2, className }: { card: WelcomeGiftCard; headingLevel?: 2 | 3; className?: string }) {
  const t = useTranslations('rewards.welcomeCard');
  const { formatDate } = useFormat();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const amount = giftAmount(card.amountCents);
  const rewardsLink = (chunks: ReactNode) => <Link href={routes.app.rewards()} className="font-semibold underline underline-offset-4">{chunks}</Link>;
  const done = card.checks.filter((entry) => entry.state === 'done').length;
  const titleId = `welcome-gift-${headingLevel}`;

  const title = t(`titles.${card.state}`, { amount });
  const body =
    card.state === 'open'
      ? t('openBody', { amount })
      : card.state === 'earned'
        ? card.queuedUntil ? t('queuedBody', { date: formatDate(card.queuedUntil) }) : t.rich('earnedBody', { link: rewardsLink })
        : card.state === 'ready'
          ? card.expiresAt ? t.rich('readyBody', { date: formatDate(card.expiresAt), link: rewardsLink }) : t.rich('readyBodyNoDate', { link: rewardsLink })
          : t.rich('deliveredBody', { link: rewardsLink });
  const action = card.state === 'open'
    ? { href: nextCheckHref(card), label: t('continue') }
    : card.state === 'ready' ? { href: routes.app.rewards(), label: t('pick') } : null;

  return <section aria-labelledby={titleId} className={cn('group/gift relative isolate overflow-hidden rounded-[1.375rem] border border-badge-reward-foreground/15 bg-badge-reward p-4 text-badge-reward-foreground shadow-card sm:p-6', className)}>
    <span aria-hidden="true" className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full opacity-35 blur-3xl" style={{ backgroundImage: 'var(--iridescent)' }} />
    <div className="flex flex-col-reverse gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-xs font-semibold tracking-[0.16em] uppercase">{t('eyebrow')}</p>
        <Heading id={titleId} className="font-display text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance">{title}</Heading>
        <p className="max-w-reading">{body}</p>
        <div className="space-y-2 pt-1">
          <p className="text-sm font-medium tabular-nums">{t('progress', { done, total: card.checks.length })}</p>
          <ol aria-label={t('checksLabel')} className="grid gap-2 sm:grid-cols-3">
            {card.checks.map(({ check, state }) => <li key={check} className={cn('flex min-h-12 items-center gap-2.5 rounded-xl border border-badge-reward-foreground/12 bg-card/55 px-3 py-2 dark:bg-white/[0.04]', state === 'done' && 'border-success/30')}>
              <span aria-hidden="true" className="shrink-0 [&_svg]:size-5">{CHECK_ICON[state]}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{t(`checks.${check}`)}</span>
                <span className="block text-xs text-muted-foreground">{check === 'background' && state === 'skipped' ? t('backgroundSkipped') : t(`states.${state}`)}</span>
              </span>
            </li>)}
          </ol>
        </div>
        {card.foundingNumber !== undefined && <p className="text-sm font-medium">{t('founding', { number: card.foundingNumber })}</p>}
        {action && <Link href={action.href} className="group/cta inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-shadow hover:shadow-[0_12px_28px_-12px_rgb(0_0_0/0.45)]">
          {action.label}<ArrowRight aria-hidden="true" className="size-4 transition-transform duration-300 group-hover/cta:translate-x-0.5" />
        </Link>}
        <p className="text-xs text-badge-reward-foreground">{t('fineprint')}</p>
      </div>
      <GiftCardArt amountCents={card.amountCents} state={card.state} />
    </div>
  </section>;
}

/** Onboarding's one-line reminder under the stepper: the three checks, then the gift card they earn. */
export function WelcomeGiftStrip({ card, className }: { card: WelcomeGiftCard; className?: string }) {
  const t = useTranslations('rewards.welcomeCard');
  const done = card.checks.filter((entry) => entry.state === 'done').length;
  const amount = giftAmount(card.amountCents);
  const earned = card.state !== 'open';
  return <aside aria-label={t('stripLabel')} className={cn('flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl border border-badge-reward-foreground/15 bg-badge-reward px-3 py-2.5 text-sm text-badge-reward-foreground', className)}>
    <p className="sr-only">{earned ? t('stripEarnedSr', { amount }) : t('stripSr', { done, total: card.checks.length, amount })}</p>
    <ol aria-hidden="true" className="flex flex-wrap items-center gap-1.5">
      {card.checks.map(({ check, state }) => <li key={check} className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 font-medium', state === 'done' ? 'bg-success/15 text-foreground' : 'bg-card/60 dark:bg-white/[0.05]')}>
        <span className="[&_svg]:size-4">{CHECK_ICON[state]}</span>{t(`checks.${check}`)}
      </li>)}
    </ol>
    <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
    {earned
      ? <Link href={routes.app.rewards()} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-white underline-offset-4 hover:underline" style={{ backgroundImage: 'var(--iridescent)' }}><Gift aria-hidden="true" className="size-4" />{t('stripEarned', { amount })}</Link>
      : <span aria-hidden="true" className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 font-semibold text-white" style={{ backgroundImage: 'var(--iridescent)' }}><Gift className="size-4" />{t('stripGift', { amount })}</span>}
  </aside>;
}
