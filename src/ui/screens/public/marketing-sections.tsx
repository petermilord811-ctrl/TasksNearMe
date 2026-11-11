import Link from 'next/link';
import { ArrowRight, CircleDollarSign, Hammer, Laptop, Leaf, Lock, MapPin, Package, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CategorySlug, type CategoryView, type HelperSummary, type ISODateTime, type MarketView, type TaskPublicView } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { Section } from '@/ui/components/layout/section';
import { PublicTaskCard } from '@/ui/components/tasks/public-task-card';
import { HelperCard } from '@/ui/components/people/helper-card';
import { buttonVariants } from '@/ui/primitives/button';

export const categoryIcons = { 'furniture-assembly': Hammer, 'moving-help': Package, 'yard-cleanup': Leaf, 'light-cleaning': Sparkles, 'computer-help': Laptop } satisfies Record<CategorySlug, typeof Hammer>;

export function CategoryGrid({ categories, market }: { categories: CategoryView[]; market: MarketView }) {
  const t = useTranslations('publicPages');
  return <Section title={t('shared.categoriesTitle')} description={t('shared.categoriesDescription')}>
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => {
        const Icon = categoryIcons[category.slug];
        return <li key={category.slug}><Link href={routes.category(category.slug, market.slug)} className="group flex h-full items-start gap-4 rounded-xl border border-transparent bg-secondary p-card text-secondary-foreground transition-colors hover:border-primary">
          <Icon aria-hidden="true" className="mt-1 size-6 shrink-0" />
          <div className="min-w-0"><h3 className="text-[17px] leading-6 font-semibold lg:text-lg">{category.name}</h3><p className="mt-1 text-sm">{t(`categories.${category.slug}.scope`)}</p></div>
          <ArrowRight aria-hidden="true" className="mt-1 ml-auto size-4 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
        </Link></li>;
      })}
    </ul>
  </Section>;
}

export function RecentTasks({ tasks, now }: { tasks: TaskPublicView[]; now: ISODateTime }) {
  const t = useTranslations('publicPages.shared');
  return <Section title={t('recentTasks')} description={t('recentTasksDescription')}>
    {tasks.length ? <ul className="grid gap-4 md:grid-cols-2">{tasks.map((task) => <li key={task.id} className="min-w-0"><PublicTaskCard task={task} now={now} /></li>)}</ul>
      : <EmptyState title={t('noTasksTitle')} body={t('noTasksBody')} action={{ label: t('postTask'), href: routes.app.newTask() }} />}
  </Section>;
}

export function FeaturedHelpers({ helpers, title }: { helpers: HelperSummary[]; title?: string }) {
  const t = useTranslations('publicPages.shared');
  return <Section title={title ?? t('featuredHelpers')} description={t('helpersDescription')}>
    {helpers.length ? <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{helpers.map((helper) => <li key={helper.id} className="min-w-0"><HelperCard helper={helper} /></li>)}</ul>
      : <EmptyState title={t('noHelpersTitle')} body={t('noHelpersBody')} action={{ label: t('postTask'), href: routes.app.newTask() }} />}
  </Section>;
}

export function Coverage({ market }: { market: MarketView }) {
  const t = useTranslations('publicPages.shared');
  return <Section title={t('coverageTitle', { market: market.name })}>
    <div className="rounded-xl border bg-card p-card shadow-card">
      <p className="flex items-start gap-2"><MapPin aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />{t('coverageNote', { market: market.name, miles: market.serviceRadiusMiles })}</p>
      <ul className="mt-4 flex flex-wrap gap-2">{market.areaNames.map((area) => <li key={area} className="rounded-full bg-muted px-3 py-1 text-sm">{area}</li>)}</ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-3"><p className="text-sm text-muted-foreground">{t('outsideArea')}</p><Link href={routes.waitlist()} className={buttonVariants({ variant: 'link', className: 'px-0' })}>{t('joinWaitlist')}<ArrowRight aria-hidden="true" /></Link></div>
    </div>
  </Section>;
}

export function TrustStrip() {
  const t = useTranslations('publicPages.shared');
  return <Section title={t('trustTitle')}>
    <div className="grid gap-6 border-y py-6 md:grid-cols-3">
      {([{ key: 'payment', Icon: CircleDollarSign }, { key: 'privacy', Icon: Lock }, { key: 'identity', Icon: ShieldCheck }] as const).map(({ key, Icon }) => <div key={key} className="space-y-2"><Icon aria-hidden="true" className="size-6 text-primary" /><h3 className="text-[17px] font-semibold">{t(`${key}Title`)}</h3><p className="text-sm leading-6 text-muted-foreground">{t(key)}</p></div>)}
    </div>
  </Section>;
}
