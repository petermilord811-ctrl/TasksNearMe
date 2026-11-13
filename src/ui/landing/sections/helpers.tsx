import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, CalendarClock, Gift, Repeat, WalletCards } from 'lucide-react';
import { routes, type HomePageData } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { HoverLift, Magnetic, Reveal } from '@/ui/motion';
import { ArrowLink, Heading } from './heading';

/**
 * For helpers: the pitch, what a helper keeps from a task (the fee engine's own example), the founding helper
 * reward while there is one, and how many ID-verified helpers are already here (with a few of their faces).
 */
export function HelpersSection({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.helpers');
  const reward = data.welcomeReward;
  const fee = data.feeExample;
  const keep = fee.taskPriceCents > 0 ? Math.min(100, (fee.helperEarningsCents / fee.taskPriceCents) * 100) : 0;
  const faces = data.featuredHelpers.slice(0, 4);
  const points = [
    { key: 'prices', Icon: WalletCards },
    { key: 'schedule', Icon: CalendarClock },
    { key: 'repeat', Icon: Repeat },
  ] as const;
  return (
    <section aria-labelledby="helpers-title" className="py-20 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-content px-gutter">
        <Reveal variant="bloom" origin="50% 100%">
          <div className="relative overflow-hidden rounded-[2.25rem] border border-foreground/[0.07] bg-card/70 p-6 shadow-card sm:p-10 lg:p-14">
            <div aria-hidden="true" className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full opacity-35 blur-3xl" style={{ background: 'var(--iridescent)' }} />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
              <div>
                <Heading id="helpers-title" eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} body={t('body')} />
                <ul className="mt-6 space-y-3">
                  {points.map(({ key, Icon }, index) => (
                    <Reveal as="li" key={key} index={index + 1} className="point-row flex items-center gap-3">
                      <span className="point-icon grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Icon aria-hidden="true" className="size-4" /></span>
                      <span className="font-medium">{t(key)}</span>
                    </Reveal>
                  ))}
                </ul>
                <Reveal index={4} className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-4">
                  <Magnetic>
                    <Link href={routes.becomeAHelper()} className="cta-pill inline-flex min-h-12 items-center gap-2 rounded-full bg-foreground px-6 font-semibold text-background">
                      {t('cta')}<ArrowRight aria-hidden="true" className="cta-arrow size-4" />
                    </Link>
                  </Magnetic>
                  {data.helpers.verified > 0 && (
                    <p className="flex items-center gap-3 text-sm text-muted-foreground">
                      {faces.length > 0 && (
                        <span aria-hidden="true" className="flex -space-x-2">
                          {faces.map((helper) =>
                            helper.photo ? (
                              <Image key={helper.id} src={helper.photo.src} alt="" width={36} height={36} unoptimized className="size-9 rounded-full object-cover ring-2 ring-card" />
                            ) : (
                              <span key={helper.id} className="grid size-9 place-items-center rounded-full text-[11px] font-semibold tracking-tight text-white ring-2 ring-card" style={{ backgroundImage: 'var(--iridescent)' }}>{helper.initials}</span>
                            ),
                          )}
                        </span>
                      )}
                      <span>{t('joinCount', { count: data.helpers.verified, market: data.market.name })}</span>
                    </p>
                  )}
                </Reveal>
              </div>
              <div className="grid gap-4">
                <Reveal variant="bloom" index={1} origin="50% 50%">
                  <HoverLift surfaceClassName="lift-shadow rounded-[1.75rem] border border-foreground/[0.07] bg-card/85" glow="var(--violet)" tilt={3} lift={5}>
                    <div className="p-6">
                      <p className="inline-flex items-center gap-2 text-sm font-semibold"><WalletCards aria-hidden="true" className="lift-icon size-4 text-violet" />{t('earnTitle')}</p>
                      <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.03em] tabular-nums">{formatMoney(fee.helperEarningsCents)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{t('earnBody', { price: formatMoney(fee.taskPriceCents) })}</p>
                      <div aria-hidden="true" className="mt-4 h-2 overflow-hidden rounded-full bg-foreground/[0.08]">
                        <div className="reveal-fill h-full rounded-full" style={{ width: `${keep}%`, backgroundImage: 'linear-gradient(90deg, var(--violet), #3a2a8a)' }} />
                      </div>
                      <ArrowLink href={routes.pricing()} className="mt-3">{t('earnLink')}</ArrowLink>
                    </div>
                  </HoverLift>
                </Reveal>
                {reward && (
                  <Reveal variant="bloom" index={2} origin="50% 50%">
                    <HoverLift surfaceClassName="glass rounded-[1.75rem]" glow="var(--iri-2)" tilt={3} lift={5}>
                      <div className="p-6">
                        <p className="inline-flex items-center gap-2 text-sm font-semibold"><Gift aria-hidden="true" className="lift-icon size-4 text-primary" />{t('rewardTitle')}</p>
                        <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.03em]">{t('rewardAmount', { amount: formatMoney(reward.amountCents) })}</p>
                        <p className="mt-2 text-sm text-muted-foreground">{t('rewardBody', { limit: reward.cohortLimit })}</p>
                        <div className="mt-5">
                          <div className="h-2.5 overflow-hidden rounded-full bg-foreground/[0.08]" aria-hidden="true">
                            <div className="reveal-fill h-full rounded-full" style={{ width: `${Math.min(100, (reward.spotsClaimed / Math.max(1, reward.cohortLimit)) * 100)}%`, backgroundImage: 'var(--iridescent)' }} />
                          </div>
                          <p className="mt-2 text-sm font-medium tabular-nums">{t('rewardSpots', { claimed: reward.spotsClaimed, limit: reward.cohortLimit })}</p>
                        </div>
                        <ArrowLink href={routes.legal('rewards-terms')} className="mt-2">{t('rewardTerms')}</ArrowLink>
                      </div>
                    </HoverLift>
                  </Reveal>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
