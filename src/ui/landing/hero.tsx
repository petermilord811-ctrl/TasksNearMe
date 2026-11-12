import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { CATEGORY_SLUGS, routes, type HomePageData } from '@/contracts';
import { Magnetic, MaskLines } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { AskPill } from './ask-pill';
import { HeroCanvas } from './canvas/hero-canvas';
import { FloatingCards } from './floating-cards';

/**
 * The hero: a living canvas behind, a headline that rises line by line (one vivid word), two calls to
 * action, the "I need help to…" pill, real tasks and helpers floating around it, and a scroll hint. Text
 * and calls to action are server-rendered; the motion is CSS (first paint) plus small client islands.
 */
export function Hero({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.hero');
  const live = data.market.status === 'live';
  const localTasks = data.recentTasks.filter((task) => task.location.kind === 'local');
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-24 lg:min-h-[94svh] lg:pt-44">
      <HeroCanvas categories={CATEGORY_SLUGS} labels={{ pause: t('pause'), play: t('play') }} />
      <FloatingCards tasks={localTasks} helpers={data.featuredHelpers} />
      <div data-canvas-clear="" className="relative mx-auto flex max-w-content flex-col items-center px-gutter text-center">
        <p className="enter inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-card/60 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-secondary-foreground uppercase backdrop-blur" style={{ ['--enter-delay' as string]: '40ms' }}>
          <span className="relative grid size-2 place-items-center" aria-hidden="true">
            <span className={cn('absolute size-2 rounded-full', live ? 'bg-success' : 'bg-primary')} />
            <span className={cn('absolute size-2 rounded-full [animation:pulse-ring_2s_var(--ease-out)_infinite]', live ? 'bg-success' : 'bg-primary')} />
          </span>
          {t(live ? 'eyebrowLive' : 'eyebrowSoon', { market: data.market.name, state: data.market.state })}
        </p>
        <h1 id="hero-title" className="mt-6 max-w-[14ch] font-display text-[clamp(2.75rem,8.4vw,6.4rem)] leading-[0.94] font-semibold tracking-[-0.045em] text-balance [font-stretch:94%]">
          <MaskLines
            delay={120}
            lines={[
              t('line1'),
              t('line2'),
              <>
                <span className="font-accent font-normal tracking-[-0.02em] text-violet italic">{t('line3Vivid')}</span>
                {t('line3Rest')}
              </>,
            ]}
          />
        </h1>
        <p className="enter mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl" style={{ ['--enter-delay' as string]: '520ms' }}>{t('subtitle')}</p>
        <div className="enter mt-9 flex flex-wrap items-center justify-center gap-3" style={{ ['--enter-delay' as string]: '640ms' }}>
          <Magnetic>
            <Link
              href={routes.app.newTask()}
              className="group/cta relative inline-flex min-h-13 items-center gap-2 overflow-hidden rounded-full bg-primary px-7 text-base font-semibold text-primary-foreground shadow-[0_14px_34px_-12px_var(--primary-glow)] transition-[transform,box-shadow,background-color] duration-300 hover:bg-primary-hover hover:shadow-[0_20px_40px_-12px_var(--primary-glow)] active:scale-[0.97]"
            >
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 group-hover/cta:opacity-100 group-hover/cta:[animation:sheen_900ms_var(--ease-out)]" />
              {t('primary')}
              <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-300 group-hover/cta:translate-x-1" />
            </Link>
          </Magnetic>
          <Link
            href={routes.becomeAHelper()}
            className="inline-flex min-h-13 items-center gap-2 rounded-full border border-foreground/12 bg-card/70 px-6 text-base font-semibold backdrop-blur transition-[transform,background-color,border-color] duration-300 hover:-translate-y-px hover:border-foreground/25 hover:bg-card active:scale-[0.97]"
          >
            {t('secondary')}
          </Link>
        </div>
        <AskPill className="enter mt-8" />
        <p className="enter mt-6 text-sm text-muted-foreground" style={{ ['--enter-delay' as string]: '860ms' }}>{t('trust')}</p>
      </div>
      <a href="#tasks-near-you" className="enter absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[11px] font-semibold tracking-[0.24em] text-muted-foreground uppercase transition-colors hover:text-foreground lg:flex" style={{ ['--enter-delay' as string]: '1100ms' }}>
        {t('scroll')}
        <ArrowDown aria-hidden="true" className="size-4 [animation:drift_2.4s_ease-in-out_infinite]" />
      </a>
    </section>
  );
}
