import { useTranslations } from 'next-intl';
import { routes, type HomePageData } from '@/contracts';
import { HoverLift, Reveal } from '@/ui/motion';
import { FeeExplorer } from '../fee-explorer';
import { ArrowLink, Heading } from './heading';

/** Pricing you can see: the fee engine's split for a few task prices, both sides' totals. */
export function PricingSection({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.pricing');
  return (
    <section aria-labelledby="pricing-title" className="py-20 sm:py-28 lg:py-32">
      <div className="mx-auto grid max-w-content items-center gap-10 px-gutter lg:grid-cols-2 lg:gap-16">
        <div>
          <Heading id="pricing-title" eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} body={t('body')} />
          <Reveal index={1} className="mt-6">
            <ArrowLink href={routes.pricing()}>{t('link')}</ArrowLink>
          </Reveal>
        </div>
        <Reveal variant="bloom" origin="50% 50%">
          <div className="relative">
            <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-60 blur-2xl" style={{ background: 'var(--iridescent)' }} />
            <HoverLift surfaceClassName="glass rounded-[2rem]" glow="var(--violet)" tilt={2} lift={4} grow={0.005}>
              <FeeExplorer examples={data.feeExamples} initial={data.feeExample} className="rounded-[2rem] p-6 sm:p-8" />
            </HoverLift>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
