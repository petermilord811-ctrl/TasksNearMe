import Link from 'next/link';
import { BadgeCheck, Check, Laptop, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CategoryPageData, type ISODateTime } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { buttonVariants } from '@/ui/primitives/button';
import { FeaturedHelpers, RecentTasks, categoryIcons } from './marketing-sections';

export function CategoryScreen({ data, now }: { data: CategoryPageData; now: ISODateTime }) {
  const t = useTranslations('publicPages');
  const { category, market } = data;
  const Icon = categoryIcons[category.slug];
  const included = Object.keys(t.raw(`categories.${category.slug}.included`) as Record<string, string>);
  const excluded = Object.keys(t.raw(`categories.${category.slug}.excluded`) as Record<string, string>);
  return <div className="space-y-section">
    <div className="space-y-4"><Icon aria-hidden="true" className="size-10 rounded-lg bg-secondary p-2 text-secondary-foreground" /><PageHeader title={t('category.title', { category: category.name, market: market.name })} description={t(`categories.${category.slug}.intro`)} /></div>
    <section aria-label={t('category.pricingTitle')} className="space-y-3 rounded-xl border bg-secondary p-card text-secondary-foreground">
      <p className="text-lg font-semibold tabular-nums">{t(`category.typical.${category.priceGuidance.unit}`, { market: market.name, low: formatMoney(category.priceGuidance.lowCents), high: formatMoney(category.priceGuidance.highCents) })}</p>
      <p>{t(`categories.${category.slug}.pricing`)}</p>
      {category.defaultPricingType === 'hourly' && category.minHours !== undefined && <p className="text-sm tabular-nums">{t('category.minimumHours', { hours: category.minHours })}</p>}
      <p className="text-sm">{t('category.guidanceNote')}</p>
      <Link href={routes.pricing()} className={buttonVariants({ variant: 'outline' })}>{t('category.feesLink')}</Link>
    </section>
    <div className="grid gap-6 md:grid-cols-2">
      <Section title={t('category.includedTitle')}><ul className="space-y-3">{included.map((item) => <li key={item} className="flex gap-3"><Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" /><span>{t(`categories.${category.slug}.included.${item}`)}</span></li>)}</ul></Section>
      <Section title={t('category.excludedTitle')}><ul className="space-y-3">{excluded.map((item) => <li key={item} className="flex gap-3"><Minus aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" /><span>{t(`categories.${category.slug}.excluded.${item}`)}</span></li>)}</ul></Section>
    </div>
    <div className="space-y-4 rounded-xl border bg-card p-card">
      {category.inHome && category.requiresBackgroundCheck && <p className="flex items-start gap-3"><BadgeCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />{t('category.backgroundNote')}</p>}
      {category.remoteAllowed && <p className="flex items-start gap-3"><Laptop aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />{t('category.remoteNote')}</p>}
      <p className="text-sm text-muted-foreground">{t('shared.privacy')}</p>
    </div>
    <RecentTasks tasks={data.recentTasks} now={now} />
    <FeaturedHelpers helpers={data.topHelpers} title={t('category.helpersTitle')} />
    <section className="space-y-4 rounded-xl bg-secondary p-card text-secondary-foreground"><h2 className="text-xl font-semibold">{t('category.ctaTitle')}</h2><p>{t('category.ctaBody')}</p><Link href={routes.app.newTask()} className={buttonVariants()}>{t('shared.postTask')}</Link></section>
  </div>;
}
