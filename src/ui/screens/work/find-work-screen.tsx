import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Info, Lock, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FIND_WORK_DISTANCES, routes, TASK_BOARD_SORTS, TASK_BOARD_WHEN, type FindWorkCard, type FindWorkPageData, type FindWorkQuery, type ISODateTime, type OfferStatus } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useOfferStatus } from '@/ui/components/status/use-status';
import { PublicTaskCard } from '@/ui/components/tasks/public-task-card';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

export interface FindWorkScreenProps { data: FindWorkPageData; now: ISODateTime }

function FilterLink({ href, selected, children }: { href: string; selected: boolean; children: ReactNode }) {
  return <Link href={href} aria-current={selected ? 'true' : undefined} className={cn(
    'inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
    selected ? 'border-primary bg-secondary text-secondary-foreground' : 'border-border bg-card text-foreground',
  )}>{selected && <Check aria-hidden="true" className="size-4 shrink-0" />}{children}</Link>;
}

function OwnOfferStatus({ status }: { status: OfferStatus }) {
  const t = useTranslations('findWork');
  const badge = useOfferStatus(status, 'helper');
  return <div className="space-y-2"><p className="text-sm font-medium">{t('myOffer')}</p><StatusBadge {...badge} /></div>;
}

export function FindWorkCardContext({ card }: { card: FindWorkCard }) {
  const t = useTranslations('findWork');
  const location = useTranslations('location');
  return <div className="space-y-3">
    {card.task.location.kind === 'local' && card.task.location.distanceBand && <p className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 shrink-0" />{location(`distance.${card.task.location.distanceBand}`)}</p>}
    {card.myOffer ? <OwnOfferStatus status={card.myOffer.status} /> : card.blockedReason && <p className="flex items-start gap-2 text-sm"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{t(`blockedReasons.${card.blockedReason}`)}</span></p>}
  </div>;
}

export function FindWorkScreen({ data, now }: FindWorkScreenProps) {
  const t = useTranslations('findWork');
  const { query } = data;
  const filterHref = (change: FindWorkQuery) => routes.app.findWork({ ...query, ...change, page: undefined });

  return <div className="mx-auto w-full max-w-content space-y-section">
    <PageHeader title={t('title')} description={t('description')} />
    {!data.setup.bookable && <section aria-label={t('setupTitle')} className="flex flex-col gap-4 rounded-xl border border-border bg-secondary p-card sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-xl font-semibold text-secondary-foreground">{t('setupTitle')}</h2><p className="mt-2 text-sm text-secondary-foreground">{t('setupBody')}</p></div>
      <Link href={routes.app.helperOnboarding(data.setup.nextOnboardingStep)} className={buttonVariants({ className: 'shrink-0' })}>{t('finishSetup')}<ArrowRight aria-hidden="true" /></Link>
    </section>}
    <section aria-label={t('filters')} className="space-y-5 rounded-xl border bg-card p-card shadow-card">
      <nav aria-label={t('category')} className="space-y-2">
        <p className="text-sm font-semibold">{t('category')}</p>
        <ul className="flex flex-wrap gap-2">
          <li><FilterLink href={filterHref({ category: undefined })} selected={query.category === undefined}>{t('allCategories')}</FilterLink></li>
          {data.categories.map((category) => <li key={category.slug}><FilterLink href={filterHref({ category: category.slug })} selected={query.category === category.slug}>{category.name}</FilterLink></li>)}
        </ul>
      </nav>
      <nav aria-label={t('distance')} className="space-y-2 border-t pt-5">
        <p className="text-sm font-semibold">{t('distance')}</p>
        <ul className="flex flex-wrap gap-2">{FIND_WORK_DISTANCES.map((distance) => <li key={distance}><FilterLink href={filterHref({ distance })} selected={query.distance === distance}>{t(`distanceOptions.${distance}`)}</FilterLink></li>)}</ul>
      </nav>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-5 border-t pt-5">
        <nav aria-label={t('when')} className="space-y-2">
          <p className="text-sm font-semibold">{t('when')}</p>
          <ul className="flex flex-wrap gap-2">{TASK_BOARD_WHEN.map((when) => <li key={when}><FilterLink href={filterHref({ when })} selected={query.when === when}>{t(`whenOptions.${when}`)}</FilterLink></li>)}</ul>
        </nav>
        <FilterLink href={filterHref({ remoteOnly: !query.remoteOnly })} selected={query.remoteOnly}>
          <span>{t('remoteOnly')}</span>{' '}<span className={cn('rounded-full px-2 py-0.5 text-xs', query.remoteOnly ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{query.remoteOnly ? t('remoteOn') : t('remoteOff')}</span>
        </FilterLink>
        <nav aria-label={t('sort')} className="space-y-2">
          <p className="text-sm font-semibold">{t('sort')}</p>
          <ul className="flex flex-wrap gap-2">{TASK_BOARD_SORTS.map((sort) => <li key={sort}><FilterLink href={filterHref({ sort })} selected={query.sort === sort}>{t(`sortOptions.${sort}`)}</FilterLink></li>)}</ul>
        </nav>
      </div>
    </section>
    <div className="space-y-4">
      <p className="font-semibold tabular-nums">{t('results', { count: data.totalCount })}</p>
      {data.cards.length > 0 ? <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.cards.map((card) => <li key={card.task.id} className="min-w-0"><PublicTaskCard task={card.task} now={now} headingLevel={2} href={routes.app.findWorkTask(card.task.id)} footer={<FindWorkCardContext card={card} />} /></li>)}</ul>
        : <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={{ label: t('clearFilters'), href: routes.app.findWork() }} />}
      {data.pageCount > 1 && <nav aria-label={t('pagination')} className="flex flex-wrap items-center justify-center gap-3 pt-2">
        {query.page > 1 && <Link href={routes.app.findWork({ ...query, page: query.page - 1 })} rel="prev" className={buttonVariants({ variant: 'outline' })}><ArrowLeft aria-hidden="true" className="size-4" />{t('previous')}</Link>}
        <p className="text-sm tabular-nums">{t('page', { page: query.page, count: data.pageCount })}</p>
        {query.page < data.pageCount && <Link href={routes.app.findWork({ ...query, page: query.page + 1 })} rel="next" className={buttonVariants({ variant: 'outline' })}>{t('next')}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
      </nav>}
    </div>
    <p className="flex items-start gap-2 border-t pt-6 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>
  </div>;
}
