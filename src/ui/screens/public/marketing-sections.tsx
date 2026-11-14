import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ArrowRight, CircleDollarSign, Hammer, Laptop, Leaf, Lock, MapPin, Package, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CategorySlug, CategoryView, HelperSummary, ISODateTime, MarketView, TaskPublicView } from '@/contracts';
import { routes } from '@/contracts/routes';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { Section } from '@/ui/components/layout/section';
import { PublicTaskCard } from '@/ui/components/tasks/public-task-card';
import { HelperCard } from '@/ui/components/people/helper-card';
import { HoverLift } from '@/ui/motion';
import { buttonVariants } from '@/ui/primitives/button';

export const categoryIcons = { 'furniture-assembly': Hammer, 'moving-help': Package, 'yard-cleanup': Leaf, 'light-cleaning': Sparkles, 'computer-help': Laptop } satisfies Record<CategorySlug, typeof Hammer>;

export function CategoryGrid({ categories, market }: { categories: CategoryView[]; market: MarketView }) {
  const t = useTranslations('publicPages');
  const categoryName = useTranslations('helperCard.categories');
  return <Section title={t('shared.categoriesTitle')} description={t('shared.categoriesDescription')}>
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => {
        const Icon = categoryIcons[category.slug];
        const tint = `var(--cat-${category.slug})`;
        // The landing's spring hover, in the category's own color (the icon tile and the light that follows the pointer).
        return <li key={category.slug} className="min-w-0">
          <HoverLift className="h-full" tilt={2} lift={4} glow={tint} surfaceClassName="h-full rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]">
            <Link href={routes.category(category.slug, market.slug)} className="group flex h-full items-start gap-4 rounded-[1.375rem] p-card outline-offset-4">
              <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ background: `color-mix(in oklab, ${tint} 15%, transparent)`, color: tint }}><Icon className="size-5" /></span>
              <div className="min-w-0"><h3 className="font-display text-[17px] leading-6 font-semibold tracking-[-0.01em] lg:text-lg">{categoryName(category.slug)}</h3><p className="mt-1 text-sm text-muted-foreground">{t(`categories.${category.slug}.scope`)}</p></div>
              <ArrowRight aria-hidden="true" className="mt-1 ml-auto size-4 shrink-0 text-muted-foreground transition-[transform,color] duration-300 ease-[var(--ease-out)] group-hover:translate-x-1 group-hover:text-foreground motion-reduce:transform-none" />
            </Link>
          </HoverLift>
        </li>;
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
    <div className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
      <p className="flex items-start gap-2"><MapPin aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />{t('coverageNote', { market: market.name, miles: market.serviceRadiusMiles })}</p>
      <ul className="mt-4 flex flex-wrap gap-2">{market.areaNames.map((area) => <li key={area} className="rounded-full border border-foreground/[0.08] bg-background/60 px-3 py-1 text-sm dark:border-white/[0.08]">{area}</li>)}</ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-3"><p className="text-sm text-muted-foreground">{t('outsideArea')}</p><Link href={routes.waitlist()} className={buttonVariants({ variant: 'link', className: 'px-0' })}>{t('joinWaitlist')}<ArrowRight aria-hidden="true" /></Link></div>
    </div>
  </Section>;
}

export function TrustStrip() {
  const t = useTranslations('publicPages.shared');
  return <Section title={t('trustTitle')}>
    <div className="grid gap-4 md:grid-cols-3">
      {([{ key: 'payment', Icon: CircleDollarSign }, { key: 'privacy', Icon: Lock }, { key: 'identity', Icon: ShieldCheck }] as const).map(({ key, Icon }) => <div key={key} className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] p-5"><span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-primary"><Icon className="size-5" /></span><h3 className="font-display text-[17px] font-semibold tracking-[-0.01em]">{t(`${key}Title`)}</h3><p className="text-sm leading-6 text-muted-foreground">{t(key)}</p></div>)}
    </div>
  </Section>;
}
