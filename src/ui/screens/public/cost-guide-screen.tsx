import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ArrowLeft, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CostGuidePageData } from '@/contracts';
import { formatMoney, formatMoneyShort } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { ClosingCta } from '@/ui/components/layout/closing-cta';
import { Section } from '@/ui/components/layout/section';
import { ServicePhoto } from '@/ui/components/media/service-photo';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { RelatedLinks } from './category-seo-sections';
import { CategoryNextStep } from './category-next-step';

/**
 * A city's cost guide for one service (docs/seo/PLAN.md S5): the question people search as the heading, the typical
 * range (the same numbers as the category page), what a poster pays and a helper earns at each end of it (worked
 * out by the app's fee engine), what changes the price, and how to get an exact one.
 */
export function CostGuideScreen({ data }: { data: CostGuidePageData }) {
  const t = useTranslations('publicPages');
  const categoryName = useTranslations('helperCard.categories');
  const { market, category, examples, fees } = data;
  const { lowCents, highCents, unit } = category.priceGuidance;
  const factors = Object.keys(t.raw(`costGuide.factors.${category.slug}`) as Record<string, string>);
  const at = (cents: number) => ({ price: formatMoney(cents), unit });
  return <div className="space-y-section">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end lg:gap-10">
      <div className="space-y-4">
        <Link href={routes.category(category.slug, market.slug)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" />{t('costGuide.back', { category: categoryName(category.slug), market: market.name })}
        </Link>
        <PageHeader title={data.question} description={t(`categories.${category.slug}.pricing`)} />
        <CategoryNextStep category={category.slug} />
      </div>
      {/* The category's second photo, so the guide doesn't repeat its category page (src/shared/service-photos.ts). */}
      <ServicePhoto category={category.slug} slot="alternate" crop="landscape" sizes="(min-width: 1024px) 22rem, 100vw" className="rounded-[1.375rem] border border-foreground/[0.07]" />
    </div>
    <section aria-label={t('costGuide.typicalTitle', { market: market.name })} className="space-y-3 rounded-[1.375rem] border border-callout-border bg-callout p-card text-callout-foreground">
      <p className="font-display text-xl font-semibold tracking-[-0.015em] text-callout-accent tabular-nums md:text-2xl">{t(`category.typical.${unit}`, { market: market.name, low: formatMoneyShort(lowCents), high: formatMoneyShort(highCents) })}</p>
      {category.defaultPricingType === 'hourly' && category.minHours !== undefined && <p className="text-sm tabular-nums">{t('category.minimumHours', { hours: category.minHours })}</p>}
      <p className="text-sm">{t('category.guidanceNote')}</p>
    </section>
    <Section title={t('costGuide.examplesTitle')} description={t('costGuide.examplesIntro', { unit, hours: data.exampleHours ?? 0 })}>
      <div className="grid gap-4 md:grid-cols-2">
        <PriceBreakdown breakdown={examples.low} variant="poster" title={t('costGuide.lowEnd', at(lowCents))} headingLevel={3} />
        <PriceBreakdown breakdown={examples.high} variant="poster" title={t('costGuide.highEnd', at(highCents))} headingLevel={3} />
      </div>
      <PriceBreakdown breakdown={examples.low} variant="helper" title={t('costGuide.helperEarns', at(lowCents))} headingLevel={3} />
      <p className="text-sm text-muted-foreground tabular-nums">
        {t('costGuide.feesNote', { posterFeePercent: fees.posterFeePercent, posterMinimum: formatMoney(fees.posterMinimumCents), helperFeePercent: fees.helperFeePercent })}{' '}
        <Link href={routes.pricing()} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">{t('costGuide.feesLink')}</Link>
      </p>
    </Section>
    <Section title={t('costGuide.factorsTitle')}>
      <ul className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-5 shadow-card dark:border-white/[0.06]">
        {factors.map((factor) => <li key={factor} className="flex gap-3"><Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 rounded-full bg-badge-success p-0.5 text-badge-success-foreground" /><span>{t(`costGuide.factors.${category.slug}.${factor}`)}</span></li>)}
      </ul>
    </Section>
    <Section title={t('costGuide.stepsTitle')}>
      <ol className="max-w-reading list-decimal space-y-2 pl-6 marker:text-muted-foreground">
        {(['post', 'offers', 'book'] as const).map((step) => <li key={step} className="pl-1">{t(`costGuide.steps.${step}`)}</li>)}
      </ol>
    </Section>
    <ClosingCta title={t('category.ctaTitle')} body={t('category.ctaBody')} action={{ href: routes.app.newTask({ category: category.slug }), label: t('shared.postTask') }} />
    <RelatedLinks links={data.related} market={market.name} />
  </div>;
}
