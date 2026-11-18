import { useTranslations } from 'next-intl';
import { routes, type HomePageData } from '@/contracts';
import { HoverLift, Reveal } from '@/ui/motion';
import { FeeExplorer } from '../fee-explorer';
import { ArrowLink, Heading } from './heading';

/** Pricing you can see: the fee engine's split for a few task prices, both sides' totals. */
export function PricingSection({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.pricing');
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-24 py-12 sm:py-28 lg:py-32">
      <div className="mx-auto grid max-w-content items-center gap-10 px-gutter lg:grid-cols-2 lg:gap-16">
        <div>
          <Heading id="pricing-title" eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} body={t('body')} />
          <Reveal index={1} className="mt-6">
            <ArrowLink href={routes.pricing()}>{t('link')}</ArrowLink>
          </Reveal>
        </div>
        {/* The card is a solid surface, not frosted glass: while a reveal fades it in, glass could only blur what's
            inside the fading box (the bright glow behind it), so it flashed violet and then snapped to white. */}
        <Reveal variant="bloom" origin="50% 50%" className="relative isolate">
          <div aria-hidden="true" className="absolute -inset-5 -z-10 rounded-[2.5rem] opacity-45 blur-2xl dark:opacity-30" style={{ background: 'var(--iridescent)' }} />
          <HoverLift surfaceClassName="rounded-[2rem] border border-foreground/[0.07] bg-card shadow-glass dark:border-white/[0.08]" glow="var(--violet)" tilt={2} lift={4} grow={0.005}>
            <FeeExplorer examples={data.feeExamples} initial={data.feeExample} className="rounded-[2rem] p-6 sm:p-8" />
          </HoverLift>
        </Reveal>
      </div>
    </section>
  );
}
