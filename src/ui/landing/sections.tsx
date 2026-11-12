import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, BadgeCheck, CalendarClock, Gift, LockKeyhole, MapPin, MessagesSquare, Repeat, ShieldCheck, Sparkles, Star, WalletCards } from 'lucide-react';
import { routes, type HomePageData } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/ui/primitives/accordion';
import { Magnetic, Reveal, Spotlight } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CategoryCards } from './category-cards';
import { FeeExplorer } from './fee-explorer';

/** A section heading: eyebrow, a title with an accent word (italic serif, violet), and a short line. */
function Heading({ id, eyebrow, title, accent, body, align = 'left' }: { id: string; eyebrow: string; title: string; accent?: string; body?: ReactNode; align?: 'left' | 'center' }) {
  return (
    <Reveal className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-3 font-display text-4xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
        {title} {accent && <span className="font-accent font-normal tracking-[-0.01em] text-violet italic">{accent}</span>}
      </h2>
      {body && <p className="mt-4 text-lg text-muted-foreground">{body}</p>}
    </Reveal>
  );
}

export function CategoriesSection({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.categories');
  return (
    <section aria-labelledby="categories-title" className="py-16 sm:py-24">
      <div className="mx-auto max-w-content px-gutter">
        <Heading id="categories-title" eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} body={t('body')} />
        <div className="mt-10"><CategoryCards categories={data.categories} /></div>
      </div>
    </section>
  );
}

export function StepsSection() {
  const t = useTranslations('landing.steps');
  const steps = [
    { key: 'post', Icon: Sparkles },
    { key: 'choose', Icon: MessagesSquare },
    { key: 'done', Icon: Repeat },
  ] as const;
  return (
    <section aria-labelledby="steps-title" className="py-16 sm:py-24">
      <div className="mx-auto max-w-content px-gutter">
        <Heading id="steps-title" eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} />
        <Reveal className="relative mt-12">
          <svg aria-hidden="true" className="absolute top-10 right-[16%] left-[16%] hidden h-6 lg:block" viewBox="0 0 800 24" preserveAspectRatio="none">
            <path d="M0 12 C 200 -4, 300 28, 400 12 S 600 -4, 800 12" fill="none" stroke="url(#steps-line)" strokeWidth="2" strokeLinecap="round" pathLength={900} className="draw-on-reveal" />
            <defs>
              <linearGradient id="steps-line" x1="0" x2="1">
                <stop offset="0" stopColor="var(--iri-1)" />
                <stop offset="0.5" stopColor="var(--iri-2)" />
                <stop offset="1" stopColor="var(--iri-3)" />
              </linearGradient>
            </defs>
          </svg>
          <ol className="relative grid gap-5 lg:grid-cols-3">
            {steps.map(({ key, Icon }, index) => (
              <li key={key}>
                <Reveal variant="bloom" index={index + 1} origin="50% 0%" className="h-full">
                  <Spotlight className="h-full rounded-3xl">
                    <div className="flex h-full flex-col rounded-3xl border border-foreground/[0.07] bg-card/70 p-6 shadow-card">
                      <span className="flex items-center gap-3">
                        <span className="grid size-14 place-items-center rounded-2xl text-white shadow-[0_10px_24px_-10px_var(--primary-glow)]" style={{ backgroundImage: 'var(--iridescent)', backgroundSize: '200% 100%', backgroundPosition: `${index * 50}% 50%` }}>
                          <Icon aria-hidden="true" className="size-6" />
                        </span>
                        <span className="font-display text-5xl font-semibold text-foreground/10 tabular-nums">{index + 1}</span>
                      </span>
                      <h3 className="mt-6 font-display text-xl font-semibold tracking-[-0.02em]">{t(`${key}.title`)}</h3>
                      <p className="mt-2 text-muted-foreground">{t(`${key}.body`)}</p>
                    </div>
                  </Spotlight>
                </Reveal>
              </li>
            ))}
          </ol>
        </Reveal>
        <Reveal className="mt-8">
          <Link href={routes.howItWorks()} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('link')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
        </Reveal>
      </div>
    </section>
  );
}

export function PricingSection({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.pricing');
  const fee = data.feeExample;
  return (
    <section aria-labelledby="pricing-title" className="py-16 sm:py-24">
      <div className="mx-auto grid max-w-content items-center gap-10 px-gutter lg:grid-cols-2 lg:gap-16">
        <div>
          <Heading id="pricing-title" eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} body={t('body')} />
          <Reveal index={1} className="mt-6">
            <Link href={routes.pricing()} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('link')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
          </Reveal>
        </div>
        <Reveal variant="bloom" origin="50% 50%">
          <div className="relative">
            <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-60 blur-2xl" style={{ background: 'var(--iridescent)' }} />
            <FeeExplorer examples={data.feeExamples} initial={fee} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function TrustSection() {
  const t = useTranslations('landing.trust');
  const items = [
    { key: 'verified', Icon: BadgeCheck },
    { key: 'address', Icon: LockKeyhole },
    { key: 'payment', Icon: ShieldCheck },
    { key: 'reviews', Icon: Star },
  ] as const;
  return (
    <section aria-labelledby="trust-title" className="py-16 sm:py-24">
      <div className="mx-auto max-w-content px-gutter">
        <Heading id="trust-title" eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ key, Icon }, index) => (
            <li key={key}>
              <Reveal index={index} className="h-full">
                <Spotlight glow="var(--iri-4)" className="h-full rounded-3xl">
                  <div className="h-full rounded-3xl border border-foreground/[0.07] bg-card/70 p-6 shadow-card">
                    <span className="grid size-11 place-items-center rounded-2xl bg-violet-soft text-violet"><Icon aria-hidden="true" className="size-5" /></span>
                    <h3 className="mt-5 font-display text-lg font-semibold tracking-[-0.02em]">{t(`${key}.title`)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`${key}.body`)}</p>
                  </div>
                </Spotlight>
              </Reveal>
            </li>
          ))}
        </ul>
        <Reveal className="mt-8">
          <Link href={routes.trustAndSafety()} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('link')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
        </Reveal>
      </div>
    </section>
  );
}

export function HelpersSection({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.helpers');
  const reward = data.welcomeReward;
  const points = [
    { key: 'prices', Icon: WalletCards },
    { key: 'schedule', Icon: CalendarClock },
    { key: 'repeat', Icon: Repeat },
  ] as const;
  return (
    <section aria-labelledby="helpers-title" className="py-16 sm:py-24">
      <div className="mx-auto max-w-content px-gutter">
        <Reveal variant="bloom" origin="50% 100%">
          <div className="relative overflow-hidden rounded-[2.25rem] border border-foreground/[0.07] bg-card/70 p-6 shadow-card sm:p-10 lg:p-14">
            <div aria-hidden="true" className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full opacity-35 blur-3xl" style={{ background: 'var(--iridescent)' }} />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
              <div>
                <Heading id="helpers-title" eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} body={t('body')} />
                <ul className="mt-6 space-y-3">
                  {points.map(({ key, Icon }, index) => (
                    <Reveal as="li" key={key} index={index + 1} className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Icon aria-hidden="true" className="size-4" /></span>
                      <span className="font-medium">{t(key)}</span>
                    </Reveal>
                  ))}
                </ul>
                <Reveal index={4} className="mt-8">
                  <Magnetic>
                    <Link href={routes.becomeAHelper()} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-foreground px-6 font-semibold text-background transition-[transform,box-shadow] duration-300 hover:shadow-[0_14px_30px_-12px_rgb(0_0_0/0.5)] active:scale-[0.97]">
                      {t('cta')}<ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </Magnetic>
                </Reveal>
              </div>
              {reward && (
                <Reveal variant="bloom" index={2} origin="50% 50%">
                  <div className="glass rounded-[1.75rem] p-6">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold"><Gift aria-hidden="true" className="size-4 text-primary" />{t('rewardTitle')}</p>
                    <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.03em]">{t('rewardAmount', { amount: formatMoney(reward.amountCents) })}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{t('rewardBody', { limit: reward.cohortLimit })}</p>
                    <div className="mt-5">
                      <div className="h-2.5 overflow-hidden rounded-full bg-foreground/[0.08]" aria-hidden="true">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (reward.spotsClaimed / Math.max(1, reward.cohortLimit)) * 100)}%`, backgroundImage: 'var(--iridescent)' }} />
                      </div>
                      <p className="mt-2 text-sm font-medium tabular-nums">{t('rewardSpots', { claimed: reward.spotsClaimed, limit: reward.cohortLimit })}</p>
                    </div>
                    <Link href={routes.legal('rewards-terms')} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('rewardTerms')}</Link>
                  </div>
                </Reveal>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function CoverageStrip({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.coverage');
  return (
    <section aria-labelledby="coverage-title" className="py-10">
      <div className="mx-auto max-w-content px-gutter">
        <Reveal className="flex flex-col gap-4 rounded-3xl border border-dashed border-foreground/15 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{t('eyebrow')}</p>
            <h2 id="coverage-title" className="mt-2 font-display text-2xl font-semibold tracking-[-0.025em]">{t('title', { market: data.market.name })}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('body', { radius: data.market.serviceRadiusMiles })}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {data.market.areaNames.map((area) => (
                <li key={area} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.05] px-3 py-1 text-sm"><MapPin aria-hidden="true" className="size-3.5 text-muted-foreground" />{area}</li>
              ))}
            </ul>
          </div>
          <Link href={routes.waitlist()} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('waitlist')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
        </Reveal>
      </div>
    </section>
  );
}

export function FaqSection() {
  const t = useTranslations('landing.faq');
  const keys = ['pay', 'address', 'verified', 'rebook', 'helper'] as const;
  return (
    <section aria-labelledby="faq-title" className="py-16 sm:py-24">
      <div className="mx-auto grid max-w-content gap-10 px-gutter lg:grid-cols-[1fr_1.4fr]">
        <Heading id="faq-title" eyebrow={t('eyebrow')} title={t('title')} />
        <Reveal index={1}>
          <Accordion type="single" collapsible className="rounded-3xl border border-foreground/[0.07] bg-card/70 px-5 shadow-card sm:px-7">
            {keys.map((key) => (
              <AccordionItem key={key} value={key}>
                <AccordionTrigger className="min-h-14 text-left text-base font-semibold">{t(`${key}.question`)}</AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-muted-foreground">{t(`${key}.answer`)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}

export function ClosingSection({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.closing');
  return (
    <section aria-labelledby="closing-title" className="px-gutter pt-8 pb-20 sm:pb-28">
      <Reveal variant="bloom" origin="50% 100%" className="mx-auto max-w-content">
        <div className="relative isolate overflow-hidden rounded-[2.5rem] px-6 py-16 text-center text-white sm:px-12 sm:py-24">
          <div aria-hidden="true" className="absolute inset-0 -z-10 [animation:hue-drift_14s_ease-in-out_infinite]" style={{ backgroundImage: 'linear-gradient(120deg, #3b1d8f, #7a2bd1 30%, #d2357a 62%, #ff7a45)', backgroundSize: '220% 220%' }} />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,rgb(255_255_255/0.18),transparent_60%)]" />
          <h2 id="closing-title" className="mx-auto max-w-3xl font-display text-[clamp(2.25rem,5.5vw,4.25rem)] leading-[0.98] font-semibold tracking-[-0.04em] text-balance">
            {t('title')} <span className="font-accent font-normal italic">{t('titleAccent')}</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/85">{t('body')}</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Magnetic>
              <Link href={routes.app.newTask()} className="inline-flex min-h-13 items-center gap-2 rounded-full bg-white px-7 font-semibold text-[#1a1033] shadow-[0_16px_36px_-14px_rgb(0_0_0/0.6)] transition-transform duration-300 hover:-translate-y-px active:scale-[0.97]">
                {t('primary')}<ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Magnetic>
            <Link href={routes.taskBoard(data.market.slug)} className="inline-flex min-h-13 items-center gap-2 rounded-full border border-white/40 px-6 font-semibold text-white transition-[background-color,transform] duration-300 hover:bg-white/10 active:scale-[0.97]">
              {t('secondary')}
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
