import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ViewTransition } from 'react';
import { BadgeCheck, Check, Laptop, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CategoryPageData, type ISODateTime } from '@/contracts';
import { formatMoneyShort } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { ClosingCta } from '@/ui/components/layout/closing-cta';
import { Section } from '@/ui/components/layout/section';
import { ServicePhoto } from '@/ui/components/media/service-photo';
import { buttonVariants } from '@/ui/primitives/button';
import { CategoryNextStep } from './category-next-step';
import { CategoryAbout, CategoryCounts, CategoryFaq, CategoryRelated } from './category-seo-sections';
import { MarketActivity, categoryIcons } from './marketing-sections';

export function CategoryScreen({ data, now }: { data: CategoryPageData; now: ISODateTime }) {
  const t = useTranslations('publicPages');
  const categoryName = useTranslations('helperCard.categories');
  const { category, market } = data;
  const Icon = categoryIcons[category.slug];
  const included = Object.keys(t.raw(`categories.${category.slug}.included`) as Record<string, string>);
  const excluded = Object.keys(t.raw(`categories.${category.slug}.excluded`) as Record<string, string>);
  return <div className="space-y-section">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center lg:gap-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5"><ViewTransition name={`category-icon-${category.slug}`} share="category-morph" default="none"><span className="grid size-14 shrink-0 place-items-center rounded-2xl shadow-[inset_0_0_0_1px_color-mix(in_oklab,currentColor_18%,transparent)]" style={{ background: `color-mix(in oklab, var(--cat-${category.slug}) 15%, transparent)`, color: `var(--cat-${category.slug})` }}><Icon aria-hidden="true" className="size-7" /></span></ViewTransition><div className="min-w-0 flex-1"><PageHeader title={t('category.title', { category: categoryName(category.slug), market: market.name })} description={t(`categories.${category.slug}.intro`)} />{data.seo && <CategoryCounts seo={data.seo} />}<div className="mt-5"><CategoryNextStep category={category.slug} /></div></div></div>
      {/* A real photo of this kind of work, described by what's in it (src/shared/service-photos.ts). Often the page's
          largest paint, so it's preloaded; beside the heading on wide screens, under it on phones. */}
      <ServicePhoto category={category.slug} crop="wide" preload sizes="(min-width: 1024px) 30rem, 100vw" className="rounded-[1.375rem] border border-foreground/[0.07]" />
    </div>
    <section aria-label={t('category.pricingTitle')} className="space-y-3 rounded-[1.375rem] border border-callout-border bg-callout p-card text-callout-foreground">
      <p className="font-display text-xl font-semibold tracking-[-0.015em] text-callout-accent tabular-nums md:text-2xl">{t(`category.typical.${category.priceGuidance.unit}`, { market: market.name, low: formatMoneyShort(category.priceGuidance.lowCents), high: formatMoneyShort(category.priceGuidance.highCents) })}</p>
      <p>{t(`categories.${category.slug}.pricing`)}</p>
      {category.defaultPricingType === 'hourly' && category.minHours !== undefined && <p className="text-sm tabular-nums">{t('category.minimumHours', { hours: category.minHours })}</p>}
      <p className="text-sm">{t('category.guidanceNote')}</p>
      <Link href={routes.pricing()} className={buttonVariants({ variant: 'outline' })}>{t('category.feesLink')}</Link>
    </section>
    <div className="grid gap-6 md:grid-cols-2">
      <Section title={t('category.includedTitle')}><ul className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] p-5">{included.map((item) => <li key={item} className="flex gap-3"><Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 rounded-full bg-badge-success p-0.5 text-badge-success-foreground" /><span>{t(`categories.${category.slug}.included.${item}`)}</span></li>)}</ul></Section>
      <Section title={t('category.excludedTitle')}><ul className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] p-5">{excluded.map((item) => <li key={item} className="flex gap-3"><Minus aria-hidden="true" className="mt-0.5 size-5 shrink-0 rounded-full bg-muted p-0.5 text-muted-foreground" /><span>{t(`categories.${category.slug}.excluded.${item}`)}</span></li>)}</ul></Section>
    </div>
    <div className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card dark:border-white/[0.06]">
      {category.inHome && category.requiresBackgroundCheck && <p className="flex items-start gap-3"><BadgeCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />{t('category.backgroundNote')}</p>}
      {category.remoteAllowed && <p className="flex items-start gap-3"><Laptop aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />{t('category.remoteNote')}</p>}
      <p className="text-sm text-muted-foreground">{t('shared.privacy')}</p>
    </div>
    {data.seo && <CategoryAbout seo={data.seo} market={market.name} />}
    <MarketActivity tasks={data.recentTasks} helpers={data.topHelpers} now={now} market={data.market} helpersTitle={t('category.helpersTitle')} category={category.slug} />
    {data.seo && <CategoryFaq seo={data.seo} />}
    <ClosingCta title={t('category.ctaTitle')} body={t('category.ctaBody')} action={{ href: routes.app.newTask({ category: category.slug }), label: t('shared.postTask') }} />
    {data.seo && <CategoryRelated seo={data.seo} market={market.name} />}
  </div>;
}
