import Link from 'next/link';
import { ArrowLeft, CalendarDays, CircleDollarSign, Flag, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type HelperTaskView, type HelperWorkHandlers, type ISODateTime } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { GeneralArea } from '@/ui/components/location/general-area';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { buttonVariants } from '@/ui/primitives/button';
import { RichText } from '@/ui/components/rich-text/rich-text';
import { TaskPhotoCarousel } from '@/ui/components/tasks/task-photo-carousel';
import { TaskSpec } from '@/ui/components/tasks/task-spec';
import { HelperOffer } from './helper-offer';

export interface HelperTaskScreenProps {
  data: HelperTaskView;
  handlers: HelperWorkHandlers;
  now: ISODateTime;
  /** Previews and tests: the drawn map only. */
  liveMap?: boolean;
  /** Preview-only starting state. */
  initialRevising?: boolean;
  initialResult?: ActionResult;
}

export function HelperTaskScreen({ data, handlers, now, initialRevising, initialResult, liveMap = true }: HelperTaskScreenProps) {
  const { formatDate, formatDateTime, formatMonthYear, formatRelative, formatTimeRange, dayKey } = useFormat();
  const t = useTranslations('helperTask');
  const report = useTranslations('report');
  const card = useTranslations('taskCard');
  const blocked = useTranslations('findWork');
  const { task } = data;
  const schedule = task.schedule.flexible ? card('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
    : dayKey(task.schedule.windowStart) === dayKey(task.schedule.windowEnd)
      ? card('scheduledWindow', { date: formatDate(task.schedule.windowStart), window: formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd) })
      : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd);

  const facts = [
    { key: 'budget', Icon: CircleDollarSign, label: t('budget'), value: task.budget.type === 'fixed' ? formatMoney(task.budget.priceCents) : card('hourlyBudget', { rate: formatMoney(task.budget.rateCents), cap: formatHours(task.budget.hoursCap) }) },
    { key: 'when', Icon: CalendarDays, label: t('when'), value: schedule },
  ];
  const answered = Object.values(data.details).some((value) => value !== undefined && value !== '');

  // 2026-11-23 (the structured task page): the title and what decides an offer first, then the photos as a carousel, the
  // task in the client's words, its answers as a spec sheet, the area and the client, then the offer.
  return <div className="mx-auto min-w-0 max-w-reading space-y-6">
    <header className="space-y-3">
      <Link href={routes.app.findWork()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline"><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center rounded-full px-3 py-1 font-medium" style={{ background: `color-mix(in oklab, var(--cat-${task.categorySlug}) 12%, transparent)` }}>{card(`categories.${task.categorySlug}`)}</span>
        <time dateTime={task.postedAt} title={formatDateTime(task.postedAt)} className="text-muted-foreground tabular-nums">{card('posted', { relative: formatRelative(task.postedAt, now) })}</time>
      </div>
      <h1 className="font-display text-[1.75rem]/9 font-semibold tracking-[-0.02em] text-balance [overflow-wrap:anywhere] md:text-[2rem]/10">{task.title}</h1>
    </header>
    <dl className="grid gap-2.5 sm:grid-cols-2">
      {facts.map(({ key, Icon, label, value }) => <div key={key} className="relative min-w-0 rounded-2xl border border-foreground/[0.07] bg-card py-3.5 pr-3.5 pl-[3.75rem] shadow-card dark:border-white/[0.06]">
        <dt className="text-sm text-muted-foreground"><span aria-hidden="true" className="absolute top-3.5 left-3.5 grid size-9 place-items-center rounded-xl bg-brand-soft text-primary"><Icon className="size-[1.125rem]" /></span>{label}</dt>
        <dd className={key === 'budget' ? 'font-display text-xl font-semibold tabular-nums' : 'font-medium tabular-nums'}>{value}</dd>
      </div>)}
    </dl>
    {data.photos.length > 0 && <TaskPhotoCarousel photos={data.photos} posterName={task.poster.displayName} />}
    <section aria-labelledby="helper-task-about" className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]"><h2 id="helper-task-about" className="font-display text-lg font-semibold">{t('about')}</h2><RichText text={data.description} headingLevel={3} /></section>
    {(answered || data.expenseAllowance) && <section aria-labelledby="helper-task-details" className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
      <h2 id="helper-task-details" className="font-display text-lg font-semibold">{t('details')}</h2>
      <TaskSpec category={task.categorySlug} answers={data.details} />
      <div className="space-y-1 rounded-2xl bg-secondary/60 p-3.5 dark:bg-secondary/30"><p className="text-sm text-muted-foreground">{t('allowance')}</p>{data.expenseAllowance ? <><p className="font-semibold tabular-nums">{formatMoney(data.expenseAllowance.amountCents)}</p><p className="break-words text-sm">{data.expenseAllowance.description}</p></> : <p className="text-sm">{t('noAllowance')}</p>}</div>
    </section>}
    <section aria-labelledby="helper-task-where" className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
      <h2 id="helper-task-where" className="font-display text-lg font-semibold">{t('where')}</h2>
      <GeneralArea location={task.location} showMap liveMap={liveMap} />
      {task.location.kind === 'local' && <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>}
    </section>
    <section aria-labelledby="helper-task-client" className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
      <h2 id="helper-task-client" className="font-display text-lg font-semibold">{t('posterTitle')}</h2>
      <div className="flex items-center gap-3"><InitialsAvatar initials={task.poster.initials} /><div><p className="font-semibold">{task.poster.displayName}</p><p className="text-sm tabular-nums text-muted-foreground">{t('memberSince', { date: formatMonthYear(task.poster.memberSince) })}</p></div></div>
      {task.poster.phoneVerified && <VerificationBadges badges={{ phoneVerified: task.poster.phoneVerified }} />}
    </section>
    {data.blockedReason ? <section aria-labelledby="helper-task-blocked" className="space-y-3 rounded-xl border bg-secondary p-card text-secondary-foreground"><h2 id="helper-task-blocked" className="font-heading text-xl font-semibold">{t('blockedTitle')}</h2><p>{blocked(`blockedReasons.${data.blockedReason}`)}</p>{data.blockedReason === 'not_bookable' && <Link href={routes.app.helperOnboarding(data.setup.nextOnboardingStep)} className={buttonVariants({ variant: 'outline' })}>{t('finishSetup')}</Link>}</section>
      : <HelperOffer key={`${task.id}-${data.myOffer?.id ?? 'new'}`} data={data} handlers={handlers} now={now} initialRevising={initialRevising} initialResult={initialResult} />}
    <p><Link href={routes.app.report('task', task.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"><Flag aria-hidden="true" className="size-4" />{report('links.task')}</Link></p>
  </div>;
}
