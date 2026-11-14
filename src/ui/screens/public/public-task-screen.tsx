import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { CalendarDays, CircleDollarSign, Flag, Laptop, Lock, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ISODateTime, PublicTaskPageData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatHours, formatMoney, marketDayKey } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { PublicTaskCard } from '@/ui/components/tasks/public-task-card';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/ui/primitives/breadcrumb';
import { buttonVariants } from '@/ui/primitives/button';
import { categoryIcons } from './marketing-sections';

export interface PublicTaskScreenProps { data: PublicTaskPageData; now: ISODateTime }

export function PublicTaskScreen({ data, now }: PublicTaskScreenProps) {
  const { formatDate, formatDateTime, formatMonthYear, formatRelative, formatTimeRange } = useFormat();
  const t = useTranslations('publicTask');
  const report = useTranslations('report');
  const categoryName = useTranslations('helperCard.categories');
  const { task, category, market } = data;
  const CategoryIcon = categoryIcons[task.categorySlug];
  const LocationIcon = task.location.kind === 'remote' ? Laptop : MapPin;
  const schedule = task.schedule.flexible
    ? t('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
    : marketDayKey(task.schedule.windowStart) === marketDayKey(task.schedule.windowEnd)
      ? t('scheduledWindow', { date: formatDate(task.schedule.windowStart), window: formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd) })
      : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd);
  const budget = task.budget.type === 'fixed' ? formatMoney(task.budget.priceCents)
    : t('hourlyBudget', { rate: formatMoney(task.budget.rateCents), cap: formatHours(task.budget.hoursCap) });

  return <div className="space-y-section">
    <div className="space-y-6">
      <Breadcrumb><BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink asChild><Link href={routes.market(market.slug)}>{market.name}</Link></BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink asChild><Link href={routes.taskBoard(market.slug)}>{t('taskBoard')}</Link></BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink asChild><Link href={routes.category(category.slug, market.slug)}>{categoryName(category.slug)}</Link></BreadcrumbLink></BreadcrumbItem>
      </BreadcrumbList></Breadcrumb>
      <div className="space-y-4">
        <p className="flex items-center gap-2.5 text-sm font-medium text-foreground"><span aria-hidden="true" className="grid size-10 place-items-center rounded-2xl" style={{ background: `color-mix(in oklab, var(--cat-${task.categorySlug}) 15%, transparent)`, color: `var(--cat-${task.categorySlug})` }}><CategoryIcon className="size-5" /></span>{categoryName(category.slug)}</p>
        <PageHeader title={task.title} />
        <p className="text-sm tabular-nums text-muted-foreground"><time dateTime={task.postedAt} title={formatDateTime(task.postedAt)}>{t('posted', { relative: formatRelative(task.postedAt, now) })}</time></p>
      </div>
    </div>
    {/* Phones read top to bottom: what, where and when, the task, who posted it, then the offer. On wide screens
        the task and its poster take the left column, and the summary and the offer stay on the right. */}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:gap-x-12">
      <div className="space-y-4 rounded-[1.375rem] lg:col-start-2 lg:row-start-1 border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
        <p className="flex items-start gap-3"><LocationIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><span>{task.location.kind === 'remote' ? t('remote') : t('area', { area: task.location.areaName, market: task.location.marketName })}</span></p>
        <p className="flex items-start gap-3 tabular-nums"><CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><span>{schedule}</span></p>
        <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-4">
          <div><p className="mb-1 text-sm text-muted-foreground">{t('budget')}</p><p className="flex items-center gap-2 font-display text-2xl font-semibold tracking-[-0.02em] tabular-nums"><CircleDollarSign aria-hidden="true" className="size-5 shrink-0 text-primary" />{budget}</p></div>
          <p className="text-sm tabular-nums text-muted-foreground">{t('offers', { count: task.offerCount })}</p>
        </div>
      </div>
      <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <Section title={t('about')}><p className="whitespace-pre-line leading-7 break-words">{task.excerpt}</p></Section>
        <section aria-label={t('posterTitle')} className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
          <h2 className="font-display text-xl font-semibold tracking-[-0.015em]">{t('posterTitle')}</h2>
          <div className="flex items-center gap-3"><span className="rounded-full p-0.5 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_14%,transparent)]"><InitialsAvatar initials={task.poster.initials} /></span><div><p className="font-semibold">{task.poster.displayName}</p><p className="text-sm tabular-nums text-muted-foreground">{t('memberSince', { date: formatMonthYear(task.poster.memberSince) })}</p></div></div>
          {task.poster.phoneVerified && <VerificationBadges badges={{ phoneVerified: task.poster.phoneVerified }} />}
          {task.poster.ratingAsClient && <div className="space-y-2"><p className="text-sm text-muted-foreground">{t('clientRating')}</p><RatingStars rating={task.poster.ratingAsClient} /></div>}
        </section>
      </div>
      <div className="space-y-4 lg:sticky lg:top-28 lg:col-start-2 lg:row-start-2 lg:self-start">
        <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(task.location.kind === 'remote' ? 'remotePrivacy' : 'privacy')}</p>
        <div className="relative isolate space-y-3 overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]"><span aria-hidden="true" className="pointer-events-none absolute -top-20 -right-12 -z-10 size-56 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]" />
          {data.acceptingOffers ? <><Link href={routes.app.findWorkTask(task.id)} className={buttonVariants({ className: 'w-full sm:w-auto' })}>{t('makeOffer')}</Link><p className="text-sm">{t('offerHint')}</p></>
            : <><p className="font-semibold">{t('closed')}</p><Link href={routes.taskBoard(market.slug)} className={buttonVariants({ variant: 'outline' })}>{t('backToBoard')}</Link></>}
        </div>
      </div>
    </div>
    {data.similarTasks.length > 0 && <Section title={t('similarTasks')}><ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{data.similarTasks.map((similar) => <li key={similar.id} className="min-w-0"><PublicTaskCard task={similar} now={now} /></li>)}</ul></Section>}
    <div className="border-t pt-4 text-center"><Link href={routes.app.newTask()} className={buttonVariants({ variant: 'link', className: 'h-auto min-h-11 max-w-full whitespace-normal' })}>{t('postSimilar')}</Link></div>
    <p className="text-center"><Link href={routes.app.report('task', task.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"><Flag aria-hidden="true" className="size-4" />{report('links.task')}</Link></p>
  </div>;
}
