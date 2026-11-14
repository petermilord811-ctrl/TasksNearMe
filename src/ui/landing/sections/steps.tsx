'use client';

import { useId, useState } from 'react';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, MessagesSquare, Repeat, Send, Sparkles, Wallet } from 'lucide-react';
import { routes } from '@/contracts';
import { HoverLift, Reveal, spring, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { useOptionalLanding, type Audience } from '../landing-state';
import { ArrowLink, Heading } from './heading';

const STEPS = {
  poster: [
    { key: 'post', Icon: Sparkles },
    { key: 'choose', Icon: MessagesSquare },
    { key: 'done', Icon: Repeat },
  ],
  helper: [
    { key: 'helper.verify', Icon: BadgeCheck },
    { key: 'helper.offer', Icon: Send },
    { key: 'helper.paid', Icon: Wallet },
  ],
} as const;

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * How it works, for both sides of a booking: three steps for someone who needs help, three for a helper. The
 * switch is the hero's own ("Need help" / "Can help"), so picking a side here is the same pick everywhere on
 * the page. Switching slides the pill and swaps the steps in a short stagger; each step card answers the
 * pointer (it rises, tilts a little, its icon and number come forward).
 */
export function StepsSection() {
  const t = useTranslations('landing.steps');
  const sides = useTranslations('landing.hero.audience');
  const landing = useOptionalLanding();
  const reduced = usePrefersReducedMotion();
  const pillId = useId();
  const [ownSide, setOwnSide] = useState<Audience>('poster');
  const side = landing?.audience ?? ownSide;
  const setSide = landing?.setAudience ?? setOwnSide;
  const steps = STEPS[side];

  return (
    <LazyMotion features={domMax}>
      <section id="how-it-works" aria-labelledby="steps-title" className="scroll-mt-24 py-20 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-content px-gutter">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <Heading id="steps-title" eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} />
            <Reveal index={1}>
              <div role="group" aria-label={t('sidesLabel')} className="inline-flex rounded-full bg-foreground/[0.06] p-1">
                {(['poster', 'helper'] as const).map((value) => {
                  const on = side === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSide(value)}
                      className={cn('relative isolate min-h-11 rounded-full px-5 text-sm font-semibold transition-[color,transform] duration-300 active:scale-[0.96]', on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
                    >
                      {on && <m.span layoutId={pillId} aria-hidden="true" className="absolute inset-0 -z-10 rounded-full bg-card shadow-[0_8px_20px_-10px_rgb(0_0_0/0.4)]" transition={reduced ? { duration: 0 } : spring.bloom} />}
                      {sides(value)}
                    </button>
                  );
                })}
              </div>
            </Reveal>
          </div>

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
              <AnimatePresence initial={false} mode="popLayout">
                {steps.map(({ key, Icon }, index) => (
                  <m.li
                    key={`${side}-${key}`}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, y: 18, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, ease: EASE, delay: reduced ? 0 : 0.06 + index * 0.07 } }}
                    exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -10, filter: 'blur(4px)', transition: { duration: 0.2, ease: EASE } }}
                    transition={reduced ? { duration: 0 } : spring.bloom}
                    className="h-full"
                  >
                    <HoverLift className="h-full" surfaceClassName="lift-shadow rounded-3xl border border-foreground/[0.07] bg-card/75" glow={`var(--iri-${index + 1})`} tilt={3}>
                      <div className="flex h-full flex-col p-6">
                        <span className="flex items-center gap-3">
                          <span
                            className="lift-icon grid size-14 place-items-center rounded-2xl text-white shadow-[0_10px_24px_-10px_var(--primary-glow)]"
                            style={{ backgroundImage: 'var(--iridescent)', backgroundSize: '200% 100%', backgroundPosition: `${index * 50}% 50%` }}
                          >
                            <Icon aria-hidden="true" className="size-6" />
                          </span>
                          <span aria-hidden="true" className="lift-number font-display text-5xl font-semibold tabular-nums">{index + 1}</span>
                        </span>
                        <h3 className="mt-6 font-display text-xl font-semibold tracking-[-0.02em]">{t(`${key}.title`)}</h3>
                        <p className="mt-2 text-muted-foreground">{t(`${key}.body`)}</p>
                      </div>
                    </HoverLift>
                  </m.li>
                ))}
              </AnimatePresence>
            </ol>
          </Reveal>
          <Reveal className="mt-8">
            {side === 'poster' ? <ArrowLink href={routes.howItWorks()}>{t('link')}</ArrowLink> : <ArrowLink href={routes.becomeAHelper()}>{t('helperLink')}</ArrowLink>}
          </Reveal>
        </div>
      </section>
    </LazyMotion>
  );
}
