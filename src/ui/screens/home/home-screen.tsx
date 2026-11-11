import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, CircleDollarSign, Plus, Search, UserRoundPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AppHomePageData, type HelperHomeData, type ISODateTime } from '@/contracts';
import { marketClockTime } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Money } from '@/ui/components/money/money';
import { PublicTaskCard } from '@/ui/components/tasks/public-task-card';
import { buttonVariants } from '@/ui/primitives/button';
import { BookingRow } from '@/ui/screens/bookings/bookings-screen';
import { TaskRow } from '@/ui/screens/tasks/my-tasks-screen';
import { FindWorkCardContext } from '@/ui/screens/work/find-work-screen';
import { OfferRow } from '@/ui/screens/work/my-offers-screen';
import { AttentionList } from './attention-list';

export interface HomeScreenProps {
  data: AppHomePageData;
  now: ISODateTime;
}

function HomeSection({ id, title, action, children }: {
  id: string;
  title: string;
  action?: { label: string; href: string };
  children: ReactNode;
}) {
  return <section aria-labelledby={id} className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="text-xl leading-7 font-semibold md:text-[22px]/7.5">{title}</h2>
      {action && <Link href={action.href} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-primary hover:underline underline-offset-4">
        {action.label}<ArrowRight aria-hidden="true" className="size-4 shrink-0" />
      </Link>}
    </div>
    {children}
  </section>;
}

function HelperSetup({ setup }: { setup: HelperHomeData['setup'] }) {
  const t = useTranslations('home');
  if (setup.bookable) return null;
  return <section aria-labelledby="home-setup" className="flex flex-col gap-4 rounded-xl border border-primary bg-secondary p-card sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-start gap-3">
      <UserRoundPlus aria-hidden="true" className="mt-1 size-6 shrink-0 text-secondary-foreground" />
      <div><h2 id="home-setup" className="text-xl font-semibold text-secondary-foreground">{t('setup.title')}</h2><p className="mt-2 text-sm leading-6 text-secondary-foreground">{t('setup.body')}</p></div>
    </div>
    <Link href={routes.app.helperOnboarding(setup.nextOnboardingStep)} className={buttonVariants({ className: 'shrink-0' })}>{t('setup.action')}<ArrowRight aria-hidden="true" /></Link>
  </section>;
}

function EarningsSummary({ earnings }: { earnings: HelperHomeData['earnings'] }) {
  const t = useTranslations('home');
  return <HomeSection id="home-earnings" title={t('sections.earnings')} action={{ label: t('earningsLink'), href: routes.app.earnings() }}>
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-card shadow-card">
      <span className="hidden size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground sm:flex"><CircleDollarSign aria-hidden="true" className="size-6" /></span>
      <dl className="grid min-w-0 flex-1 grid-cols-2 gap-4">
        <div><dt className="text-sm text-muted-foreground">{t('earnings.upcoming')}</dt><dd className="mt-1"><Money cents={earnings.upcomingCents} size="lg" /></dd></div>
        <div className="border-l border-border pl-4"><dt className="text-sm text-muted-foreground">{t('earnings.onTheWay')}</dt><dd className="mt-1"><Money cents={earnings.onTheWayCents} size="lg" /></dd></div>
      </dl>
    </div>
  </HomeSection>;
}

export function HomeScreen({ data, now }: HomeScreenProps) {
  const t = useTranslations('home');
  const hour = Number(marketClockTime(now).split(':')[0]);
  const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const primaryAction = data.mode === 'poster'
    ? { label: t('postTask'), href: routes.app.newTask(), icon: Plus }
    : { label: t('findWork'), href: routes.app.findWork(), icon: Search };
  const PrimaryIcon = primaryAction.icon;

  return <div className="mx-auto w-full max-w-content space-y-section">
    <PageHeader title={t(`greeting.${period}`, { firstName: data.firstName })} description={t(`description.${data.mode}`)}>
      <Link href={primaryAction.href} className={buttonVariants()}><PrimaryIcon aria-hidden="true" />{primaryAction.label}</Link>
    </PageHeader>

    <HomeSection id="home-attention" title={t('sections.attention')}><AttentionList items={data.attention} /></HomeSection>

    {data.mode === 'helper' && <>
      <HelperSetup setup={data.setup} />
      <EarningsSummary earnings={data.earnings} />
    </>}

    <div className="grid items-start gap-section lg:grid-cols-2">
      <HomeSection id="home-upcoming" title={t('sections.upcoming')} action={{ label: t('allBookings'), href: routes.app.bookings() }}>
        {data.upcoming.length > 0
          ? <ul className="space-y-4">{data.upcoming.slice(0, 3).map((row) => <li key={row.id}><BookingRow row={row} tab="upcoming" now={now} headingLevel={3} /></li>)}</ul>
          : <EmptyState headingLevel={3} title={t('empty.upcoming.title')} body={t(`empty.upcoming.${data.mode === 'poster' ? 'posterBody' : 'helperBody'}`)} icon={<CalendarDays className="size-6" />} action={primaryAction} />}
      </HomeSection>

      {data.mode === 'poster'
        ? <HomeSection id="home-tasks" title={t('sections.openTasks')} action={{ label: t('myTasks'), href: routes.app.tasks() }}>
          {data.openTasks.length > 0
            ? <ul className="space-y-4">{data.openTasks.slice(0, 3).map((task) => <li key={task.id}><TaskRow task={task} tab="open" now={now} headingLevel={3} /></li>)}</ul>
            : <EmptyState headingLevel={3} title={t('empty.openTasks.title')} body={t('empty.openTasks.body')} icon={<Plus className="size-6" />} action={primaryAction} />}
        </HomeSection>
        : <HomeSection id="home-offers" title={t('sections.activeOffers')} action={{ label: t('myOffers'), href: routes.app.offers() }}>
          {data.activeOffers.length > 0
            ? <ul className="space-y-4">{data.activeOffers.slice(0, 3).map((row) => <li key={row.offer.id}><OfferRow row={row} now={now} headingLevel={3} /></li>)}</ul>
            : <EmptyState headingLevel={3} title={t('empty.activeOffers.title')} body={t('empty.activeOffers.body')} action={primaryAction} />}
        </HomeSection>}
    </div>

    {data.mode === 'helper' && <HomeSection id="home-nearby" title={t('sections.nearby')} action={{ label: t('findWork'), href: routes.app.findWork() }}>
      {data.suggestions.length > 0
        ? <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.suggestions.slice(0, 3).map((card) => <li key={card.task.id} className="min-w-0">
          <PublicTaskCard task={card.task} now={now} headingLevel={3} href={routes.app.findWorkTask(card.task.id)} footer={<FindWorkCardContext card={card} />} />
        </li>)}</ul>
        : <EmptyState headingLevel={3} title={t('empty.nearby.title')} body={t('empty.nearby.body')} icon={<Search className="size-6" />} action={primaryAction} />}
    </HomeSection>}
  </div>;
}
