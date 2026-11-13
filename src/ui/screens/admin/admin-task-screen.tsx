import Image from 'next/image';
import Link from 'next/link';
import { EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORY_DETAIL_FIELDS, routes, type AdminTaskHandlers, type AdminTaskPageData, type ISODateTime, type PricingInput } from '@/contracts';
import { formatDateTime, formatMoney, formatRelative } from '@/shared/format';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useTaskStatus } from '@/ui/components/status/use-status';
import { AdminCaseRows } from './admin-case-rows';
import { AdminTaskControls, type AdminTaskPreviewState } from './admin-task-controls';
import { AdminBackLink, adminH2, adminNote, adminSection } from './admin-ui';
import { cn } from '@/ui/lib/utils';

export interface AdminTaskScreenProps { data: AdminTaskPageData; handlers: AdminTaskHandlers; now: ISODateTime }

function Budget({ budget }: { budget: PricingInput }) {
  const t = useTranslations('adminTask');
  return <>{budget.type === 'fixed' ? formatMoney(budget.priceCents) : t('hourly', { rate: formatMoney(budget.rateCents), hours: budget.estimatedHours, cap: budget.hoursCap })}</>;
}

function Details({ data }: { data: AdminTaskPageData }) {
  const t = useTranslations('adminTask');
  const copy = useTranslations('postTask');
  const { task } = data;
  const rows = CATEGORY_DETAIL_FIELDS[task.categorySlug].flatMap((field) => {
    const value = task.details[field.key];
    if (value === undefined || value === '') return [];
    const display = field.kind === 'choice' && typeof value === 'string' && field.options.includes(value)
      ? copy(`details.${task.categorySlug}.${field.key}.options.${value}`)
      : typeof value === 'boolean' ? copy(value ? 'review.yes' : 'review.no') : String(value);
    return [<div key={field.key} className="space-y-1"><dt className="text-sm text-muted-foreground">{copy(`details.${task.categorySlug}.${field.key}.label`)}</dt><dd className="break-words">{display}</dd></div>];
  });
  return rows.length > 0 ? <dl className="grid gap-4 sm:grid-cols-2">{rows}</dl> : <p className="text-sm text-muted-foreground">{t('noDetails')}</p>;
}

export function AdminTaskScreen(props: AdminTaskScreenProps) { return <AdminTaskContent {...props} />; }

/** Staff: one task, its reports, and moderation (UI-033). Never the exact address (the data has none). */
export function AdminTaskContent({ data, handlers, now, ...preview }: AdminTaskScreenProps & AdminTaskPreviewState) {
  const t = useTranslations('adminTask');
  const categories = useTranslations('helperCard.categories');
  const { task } = data;
  const status = useTaskStatus(task.status);
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <nav aria-label={t('back')}><AdminBackLink href={routes.admin.cases({ queue: 'reports' })}>{t('back')}</AdminBackLink></nav>
    <header className={cn(adminSection, 'space-y-4')}>
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">{t('eyebrow')}{' · '}<span className="font-mono tracking-normal normal-case tabular-nums">{task.id}</span></p>
        <h1 className="font-display text-[1.75rem] leading-[1.12] font-semibold tracking-[-0.03em] text-balance lg:text-[2.125rem]">{task.title}</h1>
        <div className="flex flex-wrap gap-1.5"><StatusBadge {...status} />{task.hidden && <StatusBadge tone="danger" label={t('hidden')} icon={<EyeOff />} />}</div>
      </div>
      <dl className="grid gap-4 border-t border-foreground/[0.07] pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3 dark:border-white/[0.07]">
        <div className="space-y-1"><dt className="text-muted-foreground">{t('facts.category')}</dt><dd>{categories(task.categorySlug)}</dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">{t('facts.area')}</dt><dd>{task.areaName ?? t('facts.remote')}</dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">{t('facts.when')}</dt><dd className="tabular-nums">{t('window', { start: formatDateTime(task.windowStart), end: formatDateTime(task.windowEnd) })}</dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">{t('facts.budget')}</dt><dd className="font-semibold tabular-nums"><Budget budget={task.budget} /></dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">{t('facts.offers')}</dt><dd className="tabular-nums">{t('offerCount', { count: task.offerCount })}</dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">{t('facts.posted')}</dt><dd className="tabular-nums"><time dateTime={task.postedAt} title={formatRelative(task.postedAt, now)}>{formatDateTime(task.postedAt)}</time></dd></div>
      </dl>
    </header>
    {task.hidden && <section aria-labelledby="task-hidden" className={cn(adminSection, 'space-y-2 border-destructive/30 bg-destructive/[0.03] dark:border-destructive/40 dark:bg-destructive/[0.06]')}>
      <h2 id="task-hidden" className={cn(adminH2, 'flex items-center gap-2')}><EyeOff aria-hidden="true" className="size-5 shrink-0 text-destructive" />{t('hiddenTitle')}</h2>
      <p className="text-sm text-muted-foreground"><time dateTime={task.hidden.at} title={formatRelative(task.hidden.at, now)}>{t('hiddenBy', { name: task.hidden.by.displayName, date: formatDateTime(task.hidden.at) })}</time></p>
      <div className="space-y-1"><p className="text-sm font-medium">{t('reason')}</p><p className="whitespace-pre-wrap text-sm">{task.hidden.reason}</p></div>
    </section>}
    <section aria-labelledby="task-moderation" className="space-y-3">
      <h2 id="task-moderation" className={adminH2}>{t('moderation')}</h2>
      {/* Keyed by the task only: after a change the refreshed actions arrive as props and "Saved" stays. */}
      <AdminTaskControls key={task.id} data={data} handlers={handlers} {...preview} />
    </section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="task-poster" className={cn(adminSection, 'space-y-3')}>
        <h2 id="task-poster" className={adminH2}>{t('poster')}</h2>
        <div className="flex items-center gap-3"><InitialsAvatar initials={data.poster.initials} size="sm" /><div className="min-w-0"><p className="font-semibold">{data.poster.displayName}</p><p className="text-sm break-all text-muted-foreground">{data.poster.email}</p></div></div>
        <Link href={routes.admin.user(data.poster.id)} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">{t('openAccount', { name: data.poster.displayName })}</Link>
      </section>
      {data.bookingId && <section aria-labelledby="task-booking" className={cn(adminSection, 'space-y-3')}>
        <h2 id="task-booking" className={adminH2}>{t('booking')}</h2>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">{data.bookingId}</p>
        <Link href={routes.admin.booking(data.bookingId)} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">{t('openBooking')}</Link>
      </section>}
    </div>
    <section aria-labelledby="task-description" className={cn(adminSection, 'space-y-6')}>
      <div className="space-y-2"><h2 id="task-description" className={adminH2}>{t('description')}</h2><p className="whitespace-pre-wrap break-words leading-6">{task.description}</p></div>
      <div className="space-y-3"><h3 className="font-semibold">{t('details')}</h3><Details data={data} /></div>
      <div className="space-y-3"><h3 className="font-semibold">{t('photos')}</h3>
        {data.photos.length > 0 ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{data.photos.map((photo, index) => <li key={photo.id}><Image src={photo.src} alt={photo.alt || t('photoAlt', { number: index + 1, total: data.photos.length, name: data.poster.displayName })} width={photo.width ?? 800} height={photo.height ?? 600} className="aspect-4/3 w-full rounded-xl border border-foreground/[0.07] object-cover dark:border-white/[0.07]" /></li>)}</ul> : <p className="text-sm text-muted-foreground">{t('noPhotos')}</p>}
      </div>
    </section>
    <section aria-labelledby="task-cases" className="space-y-3">
      <h2 id="task-cases" className={adminH2}>{t('cases')}</h2>
      {data.cases.length === 0 ? <p className={adminNote}>{t('noCases')}</p> : <AdminCaseRows items={data.cases} now={now} caption={t('casesCaption')} />}
    </section>
  </div>;
}
