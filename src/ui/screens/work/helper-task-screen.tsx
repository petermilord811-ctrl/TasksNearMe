import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Expand, Flag, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORY_DETAIL_FIELDS, routes, type ActionResult, type HelperTaskView, type HelperWorkHandlers, type ISODateTime } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { GeneralArea } from '@/ui/components/location/general-area';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { buttonVariants } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';
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
  const details = useTranslations('postTask');
  const blocked = useTranslations('findWork');
  const { task } = data;
  const schedule = task.schedule.flexible ? card('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
    : dayKey(task.schedule.windowStart) === dayKey(task.schedule.windowEnd)
      ? card('scheduledWindow', { date: formatDate(task.schedule.windowStart), window: formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd) })
      : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd);

  return <div className="mx-auto min-w-0 max-w-reading space-y-8">
    <header className="space-y-4">
      <Link href={routes.app.findWork()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline"><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>
      <p className="text-sm font-medium text-secondary-foreground">{card(`categories.${task.categorySlug}`)}</p>
      <h1 className="break-words font-heading text-2xl/8 font-bold md:text-3xl/9.5">{task.title}</h1>
      <p className="text-sm tabular-nums text-muted-foreground"><time dateTime={task.postedAt} title={formatDateTime(task.postedAt)}>{card('posted', { relative: formatRelative(task.postedAt, now) })}</time></p>
    </header>
    <div className="space-y-4 rounded-xl border bg-card p-card shadow-card">
      <GeneralArea location={task.location} showMap liveMap={liveMap} />
      <p className="flex items-start gap-2 tabular-nums"><CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><span>{schedule}</span></p>
      <div className="border-t pt-4"><p className="text-sm text-muted-foreground">{t('budget')}</p><p className="mt-1 text-xl font-semibold tabular-nums">{task.budget.type === 'fixed' ? formatMoney(task.budget.priceCents) : card('hourlyBudget', { rate: formatMoney(task.budget.rateCents), cap: formatHours(task.budget.hoursCap) })}</p></div>
      {task.location.kind === 'local' && <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>}
    </div>
    <section aria-labelledby="helper-task-about" className="space-y-3"><h2 id="helper-task-about" className="font-heading text-xl font-semibold md:text-[22px]/7.5">{t('about')}</h2><p className="whitespace-pre-wrap break-words leading-7">{data.description}</p></section>
    <section aria-labelledby="helper-task-details" className="space-y-4 rounded-xl border bg-card p-card shadow-card">
      <h2 id="helper-task-details" className="font-heading text-xl font-semibold md:text-[22px]/7.5">{t('details')}</h2>
      <dl className="grid gap-4 sm:grid-cols-2">{CATEGORY_DETAIL_FIELDS[task.categorySlug].map((field) => {
        const value = data.details[field.key];
        if (value === undefined || value === '') return null;
        const display = field.kind === 'choice' && typeof value === 'string' && field.options.includes(value)
          ? details(`details.${task.categorySlug}.${field.key}.options.${value}`)
          : typeof value === 'boolean' ? details(value ? 'review.yes' : 'review.no') : String(value);
        return <div key={field.key} className="space-y-1"><dt className="text-sm text-muted-foreground">{details(`details.${task.categorySlug}.${field.key}.label`)}</dt><dd className="break-words">{display}</dd></div>;
      })}</dl>
    </section>
    {data.photos.length > 0 && <section aria-labelledby="helper-task-photos" className="space-y-4">
      <h2 id="helper-task-photos" className="font-heading text-xl font-semibold md:text-[22px]/7.5">{t('photos')}</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{data.photos.map((photo, index) => {
        const alt = photo.alt || t('photoAlt', { number: index + 1, total: data.photos.length, name: task.poster.displayName });
        return <li key={photo.id}><Dialog>
          <DialogTrigger asChild><button type="button" aria-label={t('openPhoto', { number: index + 1, total: data.photos.length })} className="relative min-h-11 w-full overflow-hidden rounded-lg border"><Image unoptimized src={photo.src} alt={alt} width={photo.width ?? 800} height={photo.height ?? 600} className="aspect-4/3 w-full object-cover" /><span className="absolute right-2 bottom-2 rounded-full bg-card p-2"><Expand aria-hidden="true" className="size-4" /></span></button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-reading"><DialogHeader><DialogTitle>{t('photoTitle', { number: index + 1, total: data.photos.length })}</DialogTitle><DialogDescription>{alt}</DialogDescription></DialogHeader><Image unoptimized src={photo.src} alt={alt} width={photo.width ?? 800} height={photo.height ?? 600} className="max-h-[65dvh] w-full rounded-lg object-contain" /></DialogContent>
        </Dialog></li>;
      })}</ul>
    </section>}
    <section aria-labelledby="helper-task-allowance" className="space-y-2"><h2 id="helper-task-allowance" className="font-heading text-xl font-semibold md:text-[22px]/7.5">{t('allowance')}</h2>{data.expenseAllowance ? <><p className="font-semibold tabular-nums">{formatMoney(data.expenseAllowance.amountCents)}</p><p className="break-words text-sm">{data.expenseAllowance.description}</p></> : <p className="text-sm text-muted-foreground">{t('noAllowance')}</p>}</section>
    <section aria-labelledby="helper-task-client" className="space-y-4 rounded-xl border bg-card p-card shadow-card">
      <h2 id="helper-task-client" className="font-heading text-xl font-semibold md:text-[22px]/7.5">{t('posterTitle')}</h2>
      <div className="flex items-center gap-3"><InitialsAvatar initials={task.poster.initials} /><div><p className="font-semibold">{task.poster.displayName}</p><p className="text-sm tabular-nums text-muted-foreground">{t('memberSince', { date: formatMonthYear(task.poster.memberSince) })}</p></div></div>
      {task.poster.phoneVerified && <VerificationBadges badges={{ phoneVerified: task.poster.phoneVerified }} />}
    </section>
    {data.blockedReason ? <section aria-labelledby="helper-task-blocked" className="space-y-3 rounded-xl border bg-secondary p-card text-secondary-foreground"><h2 id="helper-task-blocked" className="font-heading text-xl font-semibold">{t('blockedTitle')}</h2><p>{blocked(`blockedReasons.${data.blockedReason}`)}</p>{data.blockedReason === 'not_bookable' && <Link href={routes.app.helperOnboarding(data.setup.nextOnboardingStep)} className={buttonVariants({ variant: 'outline' })}>{t('finishSetup')}</Link>}</section>
      : <HelperOffer key={`${task.id}-${data.myOffer?.id ?? 'new'}`} data={data} handlers={handlers} now={now} initialRevising={initialRevising} initialResult={initialResult} />}
    <p><Link href={routes.app.report('task', task.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"><Flag aria-hidden="true" className="size-4" />{report('links.task')}</Link></p>
  </div>;
}
