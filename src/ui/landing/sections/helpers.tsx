import Image from 'next/image';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useTranslations } from 'next-intl';
import { ArrowRight, BadgeCheck, CalendarClock, Gift, Phone, Repeat, ShieldCheck, Star, WalletCards } from 'lucide-react';
import { routes, type HelperSummary, type HomePageData, type WelcomeGiftCheck } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { cn } from '@/ui/lib/utils';
import { HoverLift, Magnetic, Reveal } from '@/ui/motion';
import { ArrowLink, Heading } from './heading';

/** The checks that earn the welcome gift card, in onboarding order (blueprint 05 §2, 2026-11-14). */
/** Each check the welcome gift asks for (the data says which: the phone only where texts go out, 9.2), drawn so. */
const REWARD_CHECKS: Record<WelcomeGiftCheck, { key: 'phone' | 'id' | 'background'; Icon: typeof Phone }> = {
  phone: { key: 'phone', Icon: Phone },
  identity: { key: 'id', Icon: BadgeCheck },
  background: { key: 'background', Icon: ShieldCheck },
};

/**
 * For helpers: the pitch, what a helper keeps from a task (the fee engine's own example), the welcome gift card
 * (every helper who passes the phone, ID and background checks gets one) while the program is on, and how many
 * ID-verified helpers are already here (with a few of their faces).
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
    <section id="for-helpers" aria-labelledby="helpers-title" className="scroll-mt-24 py-20 sm:py-28 lg:py-32">
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
                              <span key={helper.id} className="grid size-9 place-items-center rounded-full text-xs font-semibold tracking-tight text-white ring-2 ring-card" style={{ backgroundImage: 'var(--iridescent)' }}>{helper.initials}</span>
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
                  // A solid surface, not frosted glass: glass inside the fading reveal would flash the glow's colors.
                  <Reveal variant="bloom" index={2} origin="50% 50%">
                    <HoverLift surfaceClassName="lift-shadow rounded-[1.75rem] border border-foreground/[0.07] bg-card" glow="var(--iri-2)" tilt={3} lift={5}>
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="inline-flex items-center gap-2 text-sm font-semibold"><Gift aria-hidden="true" className="lift-icon size-4 text-primary" />{t('rewardTitle')}</p>
                            {/* One line on a 360 phone too (audit L33): a step smaller there, and no card art beside it. */}
                            <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">{t('rewardAmount', { amount: formatMoney(reward.amountCents) })}</p>
                          </div>
                          <GiftCardArt amount={formatMoney(reward.amountCents)} />
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{t('rewardBody')}</p>
                        {/* The checks that earn it (two or three), drawn in one after another as the card comes in. */}
                        <ol aria-label={t('rewardStepsLabel')} className={cn('mt-5 grid gap-2', reward.checks.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                          {reward.checks.map((check) => REWARD_CHECKS[check]).map(({ key, Icon }, index) => (
                            <li key={key} className="flex flex-col items-center gap-1.5 rounded-2xl bg-foreground/[0.04] px-2 py-3 text-center text-xs font-medium dark:bg-white/[0.05]">
                              <span className="relative grid size-8 place-items-center rounded-full bg-success/12 text-success">
                                <Icon aria-hidden="true" className="size-4" />
                                <svg aria-hidden="true" viewBox="0 0 16 16" className="absolute -right-1 -bottom-1 size-4 rounded-full bg-success text-white">
                                  <path d="m4.5 8.3 2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="draw-on-reveal" style={{ ['--draw-length' as string]: '12', strokeDasharray: 12, animationDelay: `${350 + index * 220}ms` }} />
                                </svg>
                              </span>
                              {t(`rewardChecks.${key}`)}
                            </li>
                          ))}
                        </ol>
                        <ArrowLink href={routes.legal('rewards-terms')} className="mt-3">{t('rewardTerms')}</ArrowLink>
                      </div>
                    </HoverLift>
                  </Reveal>
                )}
              </div>
            </div>
            {/* Real helpers here, on phones and tablets too (wide screens meet one floating over the town). */}
            {data.featuredHelpers.length > 0 && (
              <div className="relative mt-10 xl:hidden">
                <p className="text-sm font-semibold">{t('meetTitle', { market: data.market.name })}</p>
                <ul className="-mx-6 mt-3 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none] sm:-mx-10 sm:scroll-px-10 sm:px-10 [&::-webkit-scrollbar]:hidden">
                  {data.featuredHelpers.slice(0, 8).map((helper) => (
                    <li key={helper.id} className="w-64 shrink-0 snap-start">
                      <HelperStripCard helper={helper} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** A compact helper card for the strip: face, name and ID check, area, rating and jobs done, and the headline. */
function HelperStripCard({ helper }: { helper: HelperSummary }) {
  const t = useTranslations('landing.helpers');
  return (
    <Link href={routes.helperProfile(helper.handle)} className="flex h-full flex-col gap-3 rounded-[1.25rem] border border-foreground/[0.07] bg-card p-4 transition-[translate,box-shadow] duration-300 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-card">
      <span className="flex items-center gap-3">
        {helper.photo ? (
          <Image src={helper.photo.src} alt="" width={44} height={44} unoptimized className="size-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-white" style={{ backgroundImage: 'var(--iridescent)' }}>{helper.initials}</span>
        )}
        <span className="min-w-0">
          <span className="flex items-center gap-1 font-semibold">
            <span className="truncate">{helper.displayName}</span>
            {helper.badges.idVerifiedAt && <BadgeCheck aria-label={t('idVerified')} className="size-4 shrink-0 text-violet" />}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {helper.rating ? (
              <><Star aria-hidden="true" className="mr-0.5 inline size-3 fill-reward text-reward" />{t('stripRating', { rating: helper.rating.average.toFixed(1), count: helper.rating.count })} · </>
            ) : null}
            {helper.areaName}
          </span>
        </span>
      </span>
      <span className="line-clamp-2 text-sm text-muted-foreground">{helper.headline}</span>
      {helper.completedCount > 0 && <span className="mt-auto text-xs font-medium text-foreground/80">{t('stripDone', { count: helper.completedCount })}</span>}
    </Link>
  );
}

/** A small gift card, tilted, with a light that sweeps across it now and then (still under reduced motion). */
function GiftCardArt({ amount }: { amount: string }) {
  return (
    <span aria-hidden="true" className="lift-icon relative mt-1 grid h-14 w-[5.5rem] shrink-0 -rotate-6 overflow-hidden rounded-xl p-2 text-white shadow-[0_14px_28px_-14px_rgb(124_58_237/0.7)] max-[420px]:hidden" style={{ backgroundImage: 'var(--iridescent)' }}>
      <span className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_0%,rgb(255_255_255/0.45),transparent_55%)]" />
      <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.55),transparent)] [animation:sheen_3.6s_var(--ease-out)_1.2s_infinite] motion-reduce:hidden" />
      <span className="relative h-2.5 w-3.5 rounded-[3px] bg-white/70" />
      <span className="relative self-end justify-self-end font-display text-sm leading-none font-bold tracking-tight">{amount}</span>
    </span>
  );
}
