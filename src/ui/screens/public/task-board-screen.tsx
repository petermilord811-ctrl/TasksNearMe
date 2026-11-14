import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, TASK_BOARD_SORTS, TASK_BOARD_WHEN, type ISODateTime, type TaskBoardPageData, type TaskBoardQuery } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { SideScrollList } from '@/ui/components/layout/side-scroll-list';
import { PublicTaskCard } from '@/ui/components/tasks/public-task-card';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

export interface TaskBoardScreenProps { data: TaskBoardPageData; now: ISODateTime }

function FilterLink({ href, selected, children }: { href: string; selected: boolean; children: ReactNode }) {
  return <Link href={href} aria-current={selected ? 'true' : undefined} className={cn(
    'inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-200 ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    selected ? 'border-primary/40 bg-brand-soft text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)]' : 'border-foreground/[0.1] bg-card text-foreground hover:border-foreground/25 hover:bg-background dark:border-white/[0.1]',
  )}>{selected && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}{children}</Link>;
}

export function TaskBoardScreen({ data, now }: TaskBoardScreenProps) {
  const t = useTranslations('taskBoard');
  const categoryName = useTranslations('helperCard.categories');
  const { market, query } = data;
  const filterHref = (change: TaskBoardQuery) => routes.taskBoard(market.slug, { ...query, ...change, page: undefined });
  const hasFilters = query.category !== undefined || query.when !== 'any' || query.remoteOnly;

  return <div className="space-y-section">
    <PageHeader title={t('title', { market: market.name })} description={t('description')} />
    {/* Filters. On phones each group is one row that scrolls sideways (the picked chip kept in view), so the
        first tasks show on the first screen; from `sm` up the chips wrap. */}
    <section aria-label={t('filters')} className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card sm:space-y-5 dark:border-white/[0.06]">
      <nav aria-label={t('category')} className="space-y-2">
        <p className="text-sm font-semibold">{t('category')}</p>
        <SideScrollList>
          <li><FilterLink href={filterHref({ category: undefined })} selected={query.category === undefined}>{t('allCategories')}</FilterLink></li>
          {data.categories.map((category) => <li key={category.slug}><FilterLink href={filterHref({ category: category.slug })} selected={query.category === category.slug}>{categoryName(category.slug)}</FilterLink></li>)}
        </SideScrollList>
      </nav>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-t pt-4 sm:gap-y-5 sm:pt-5">
        <nav aria-label={t('when')} className="w-full space-y-2 sm:w-auto">
          <p className="text-sm font-semibold">{t('when')}</p>
          <SideScrollList>{TASK_BOARD_WHEN.map((when) => <li key={when}><FilterLink href={filterHref({ when })} selected={query.when === when}>{t(`whenOptions.${when}`)}</FilterLink></li>)}</SideScrollList>
        </nav>
        <div>
          <Link href={filterHref({ remoteOnly: !query.remoteOnly })} aria-current={query.remoteOnly ? 'true' : undefined} className={cn('inline-flex min-h-11 items-center gap-3 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', query.remoteOnly ? 'border-primary/40 bg-brand-soft text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)]' : 'border-foreground/[0.1] bg-card hover:border-foreground/25 hover:bg-background dark:border-white/[0.1]')}>
            <span>{t('remoteOnly')}</span>{' '}<span className={cn('rounded-full px-2 py-0.5 text-xs', query.remoteOnly ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{query.remoteOnly ? t('remoteOn') : t('remoteOff')}</span>
          </Link>
        </div>
        {/* On phones the label sits beside its two chips (they wrap under it when a language runs long). */}
        <nav aria-label={t('sort')} className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:block sm:space-y-2">
          <p className="text-sm font-semibold">{t('sort')}</p>
          <ul className="flex flex-wrap gap-2">{TASK_BOARD_SORTS.map((sort) => <li key={sort}><FilterLink href={filterHref({ sort })} selected={query.sort === sort}>{t(`sortOptions.${sort}`)}</FilterLink></li>)}</ul>
        </nav>
      </div>
    </section>
    <div className="space-y-4">
      <p className="font-semibold tabular-nums">{t('results', { count: data.totalCount })}</p>
      {data.tasks.length > 0 ? <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{data.tasks.map((task) => <li key={task.id} className="min-w-0"><PublicTaskCard task={task} now={now} headingLevel={2} /></li>)}</ul>
        : <EmptyState title={t(hasFilters ? 'filteredEmptyTitle' : 'noTasksTitle')} body={t(hasFilters ? 'filteredEmptyBody' : 'noTasksBody')} action={hasFilters ? { label: t('clearFilters'), href: routes.taskBoard(market.slug) } : { label: t('postTask'), href: routes.app.newTask() }} />}
      {data.pageCount > 1 && <nav aria-label={t('pagination')} className="flex flex-wrap items-center justify-center gap-3 pt-2">
        {query.page > 1 && <Link href={routes.taskBoard(market.slug, { ...query, page: query.page - 1 })} rel="prev" className={buttonVariants({ variant: 'outline' })}><ArrowLeft aria-hidden="true" className="size-4" />{t('previous')}</Link>}
        <p className="text-sm tabular-nums">{t('page', { page: query.page, count: data.pageCount })}</p>
        {query.page < data.pageCount && <Link href={routes.taskBoard(market.slug, { ...query, page: query.page + 1 })} rel="next" className={buttonVariants({ variant: 'outline' })}>{t('next')}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
      </nav>}
    </div>
    <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>
      <div className="flex flex-wrap items-center gap-x-2"><p className="text-sm text-muted-foreground">{t('helperHint')}</p><Link href={routes.becomeAHelper()} className={buttonVariants({ variant: 'link', className: 'px-0' })}>{t('becomeHelper')}<ArrowRight aria-hidden="true" /></Link></div>
    </div>
  </div>;
}
