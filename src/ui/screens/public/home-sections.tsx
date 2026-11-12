import Link from 'next/link';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CategoryView, type HelperSummary, type ISODateTime, type MarketView, type PriceBreakdown, type TaskPublicView } from '@/contracts';
import { formatDate, formatMoney, formatRelative } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { buttonVariants } from '@/ui/primitives/button';
import { categoryIcons } from './marketing-sections';

export function HomeCategories({ categories, market }: { categories: CategoryView[]; market: MarketView }) {
  const t = useTranslations('home.landing.categories');
  const categoryCopy = useTranslations('publicPages.categories');
  return <section aria-labelledby="home-categories">
    <p className="mb-3 text-xs font-semibold tracking-widest text-clay uppercase">{t('eyebrow')}</p>
    <div className="flex flex-wrap items-end justify-between gap-3"><h2 id="home-categories" className="text-3xl/9 font-medium tracking-tight md:text-[40px]/11">{t('title')}</h2><p className="max-w-sm text-sm/6 text-muted-foreground">{t('body')}</p></div>
    <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{categories.map((category) => {
      const Icon = categoryIcons[category.slug];
      return <li key={category.slug} className="min-w-0"><Link href={routes.category(category.slug, market.slug)} className="group flex h-full gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-brand-soft sm:flex-col sm:gap-0">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-paper text-primary"><Icon aria-hidden="true" className="size-6" strokeWidth={1.5} /></span>
        <div className="flex min-w-0 flex-1 flex-col"><h3 className="text-xl/6 font-semibold sm:mt-5">{category.name}</h3><p className="mt-2 text-sm/5 text-muted-foreground">{categoryCopy(`${category.slug}.scope`)}</p>
          <div className="mt-auto pt-5"><p className="text-sm font-semibold tabular-nums">{t('price', { low: formatMoney(category.priceGuidance.lowCents), high: formatMoney(category.priceGuidance.highCents) })}</p><p className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">{t(`unit.${category.priceGuidance.unit}`)}<ArrowRight aria-hidden="true" className="size-4 text-primary transition-transform group-hover:translate-x-1 motion-reduce:transform-none" /></p></div>
        </div>
      </Link></li>;
    })}</ul><p className="mt-4 text-xs/5 text-muted-foreground">{t('guidance')}</p>
  </section>;
}

export function HomeFeeExample({ breakdown }: { breakdown: PriceBreakdown }) {
  const t = useTranslations('home.landing.fees');
  const money = useTranslations('money');
  return <section aria-labelledby="home-fees" className="grid items-center gap-8 rounded-2xl bg-brand-paper p-6 sm:p-8 lg:grid-cols-2 lg:gap-14 lg:p-12">
    <div><p className="mb-3 text-xs font-semibold tracking-widest text-clay uppercase">{t('eyebrow')}</p><h2 id="home-fees" className="text-3xl/9 font-medium tracking-tight md:text-[40px]/11">{t('title')}</h2><p className="mt-4 text-base/7 text-muted-foreground">{t('body')}</p><Link href={routes.pricing()} className={buttonVariants({ variant: 'link', className: 'mt-4 px-0' })}>{t('link')}<ArrowRight aria-hidden="true" /></Link></div>
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="p-5 sm:p-6"><h3 className="text-xl/7 font-semibold">{t('example')}</h3><dl className="mt-5 space-y-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><dt>{t('taskPrice')}</dt><dd className="font-semibold tabular-nums">{formatMoney(breakdown.taskPriceCents)}</dd></div>
        <div className="flex flex-wrap justify-between gap-2 text-muted-foreground"><dt>{t('clientFee')}</dt><dd className="tabular-nums">{formatMoney(breakdown.posterFeeCents)}</dd></div>
        <div className="flex flex-wrap justify-between gap-2 text-muted-foreground"><dt>{t('helperFee')}</dt><dd className="tabular-nums">{money('deduction', { amount: formatMoney(breakdown.helperFeeCents) })}</dd></div>
      </dl></div>
      <dl className="grid grid-cols-2 border-t border-border bg-brand-soft">
        <div className="p-4 sm:p-6"><dt className="text-sm">{t('clientTotal')}</dt><dd className="mt-2 font-heading text-3xl font-semibold text-primary tabular-nums sm:text-4xl">{formatMoney(breakdown.posterTotalCents)}</dd></div>
        <div className="border-l border-border p-4 sm:p-6"><dt className="text-sm">{t('helperTotal')}</dt><dd className="mt-2 font-heading text-3xl font-semibold text-primary tabular-nums sm:text-4xl">{formatMoney(breakdown.helperEarningsCents)}</dd></div>
      </dl><p className="border-t border-border p-5 text-xs/5 text-muted-foreground sm:px-6">{t('payment')}</p>
    </div>
  </section>;
}

export function HomeTasks({ tasks, market, now }: { tasks: TaskPublicView[]; market: MarketView; now: ISODateTime }) {
  const t = useTranslations('home.landing');
  return <section aria-labelledby="home-tasks">
    <p className="mb-3 text-xs font-semibold tracking-widest text-clay uppercase">{t('tasks.eyebrow')}</p>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="home-tasks" className="text-3xl/9 font-medium tracking-tight md:text-[40px]/11">{t('tasks.title')}</h2><p className="mt-3 text-sm/6 text-muted-foreground">{t('tasks.body')}</p></div><Link href={routes.taskBoard(market.slug)} className={buttonVariants({ variant: 'link', className: 'px-0' })}>{t('browseTasks')}<ArrowRight aria-hidden="true" /></Link></div>
    {tasks.length ? <ul className="mt-6 grid gap-4 md:grid-cols-2">{tasks.map((task) => {
      const Icon = categoryIcons[task.categorySlug];
      return <li key={task.id}><article className="flex h-full gap-3 rounded-xl border border-border bg-card p-5 sm:gap-4">
        <span className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-paper text-primary"><Icon aria-hidden="true" className="size-5" /></span>
        <div className="min-w-0 flex-1"><h3 className="text-xl/6 font-semibold"><Link href={routes.publicTask(task.slug)} className="inline-flex min-h-11 items-center rounded-md hover:text-primary hover:underline underline-offset-4">{task.title}</Link></h3>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 shrink-0" />{task.location.kind === 'remote' ? t('tasks.remote') : task.location.areaName}</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays aria-hidden="true" className="size-4 shrink-0" /><time dateTime={task.schedule.windowStart}>{formatDate(task.schedule.windowStart)}</time></p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-border pt-3"><p className="text-lg font-semibold tabular-nums"><span className="sr-only">{t('tasks.budget')} </span>{task.budget.type === 'fixed' ? formatMoney(task.budget.priceCents) : t('tasks.hourly', { amount: formatMoney(task.budget.rateCents) })}</p><time dateTime={task.postedAt} className="text-xs text-muted-foreground">{t('tasks.posted', { relative: formatRelative(task.postedAt, now) })}</time></div>
        </div>
      </article></li>;
    })}</ul> : <div className="mt-6"><EmptyState title={t('tasks.emptyTitle')} body={t('tasks.emptyBody')} action={{ label: t('postTask'), href: routes.app.newTask() }} /></div>}
  </section>;
}

export function HomeHelpers({ helpers }: { helpers: HelperSummary[] }) {
  const t = useTranslations('home.landing.helpers');
  return <section aria-labelledby="home-helpers">
    <p className="mb-3 text-xs font-semibold tracking-widest text-clay uppercase">{t('eyebrow')}</p><h2 id="home-helpers" className="text-3xl/9 font-medium tracking-tight md:text-[40px]/11">{t('title')}</h2><p className="mt-3 text-sm/6 text-muted-foreground">{t('body')}</p>
    {helpers.length ? <ul className="mt-7 grid gap-4 md:grid-cols-3">{helpers.map((helper) => <li key={helper.id} className="min-w-0"><article className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-3"><InitialsAvatar initials={helper.initials} /><div className="min-w-0"><h3 className="text-xl font-semibold"><Link href={routes.helperProfile(helper.handle)} className="inline-flex min-h-11 items-center rounded-md hover:text-primary hover:underline underline-offset-4">{helper.displayName}</Link></h3><p className="text-sm text-muted-foreground">{helper.areaName}</p></div></div>
      <p className="text-sm/6 text-muted-foreground">{helper.headline}</p><RatingStars rating={helper.rating} /><div className="mt-auto border-t border-border pt-4"><VerificationBadges badges={helper.badges} compact /></div>
    </article></li>)}</ul> : <div className="mt-6"><EmptyState title={t('emptyTitle')} body={t('emptyBody')} /></div>}
  </section>;
}
