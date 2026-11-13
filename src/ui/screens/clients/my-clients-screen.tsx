import Link from 'next/link';
import { ArrowRight, CalendarDays, Clock3, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type MyClientRow, type MyClientsPageData } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { FinishSetupPanel } from '@/ui/components/helper/finish-setup-panel';
import { PageHeader } from '@/ui/components/layout/page-header';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { buttonVariants } from '@/ui/primitives/button';

export interface MyClientsScreenProps { data: MyClientsPageData; now: ISODateTime }

function ClientRow({ row, now }: { row: MyClientRow; now: ISODateTime }) {
  const { formatDate, formatDateTime, formatRelative } = useFormat();
  const t = useTranslations('clients.list');
  const actions = useTranslations('actions');
  const categories = useTranslations('taskCard.categories');
  const { client, lastBooking, openProposal } = row;
  const titleId = `client-${client.id}`;
  const price = lastBooking.pricing.type === 'fixed'
    ? formatMoney(lastBooking.pricing.priceCents)
    : t('hourlyPrice', { rate: formatMoney(lastBooking.pricing.rateCents), hours: formatHours(lastBooking.pricing.estimatedHours), cap: formatHours(lastBooking.pricing.hoursCap) });

  return <article aria-labelledby={titleId} className="min-w-0 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <InitialsAvatar initials={client.initials} />
        <div className="min-w-0">
          <h2 id={titleId} className="break-words font-display text-lg font-semibold tracking-[-0.01em]">{client.displayName}</h2>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">{t('bookingsTogether', { count: row.completedCount })}</p>
        </div>
      </div>
      {row.actions.map((action) => <Link key={action} href={routes.app.bookingRebook(lastBooking.id)} className={buttonVariants({ variant: 'outline', className: 'max-sm:w-full' })}>{actions(action)}<ArrowRight aria-hidden="true" className="size-4" /></Link>)}
    </div>
    <div className="mt-5 grid gap-5 border-t pt-5 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)]">
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-muted-foreground">{t('lastBooking')}</p>
        <h3 className="break-words font-semibold">{lastBooking.title}</h3>
        <p className="text-sm text-secondary-foreground">{categories(lastBooking.categorySlug)}</p>
        <p className="flex items-start gap-2 text-sm tabular-nums text-muted-foreground"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><time dateTime={lastBooking.completedAt}>{t('completed', { date: formatDate(lastBooking.completedAt) })}</time></p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">{t('price')}</dt><dd className="mt-1 text-sm font-medium tabular-nums">{price}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{t('earned')}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(lastBooking.earnedCents)}</dd></div>
      </dl>
    </div>
    {openProposal && <div className="mt-5 space-y-3 rounded-2xl border border-foreground/[0.08] bg-background/70 p-4 dark:border-white/[0.08]">
      <StatusBadge tone="info" label={t('waiting')} />
      <p className="text-sm font-medium tabular-nums"><time dateTime={openProposal.start}>{t('starts', { date: formatDateTime(openProposal.start) })}</time></p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-sm text-muted-foreground"><Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><div><p className="tabular-nums"><time dateTime={openProposal.expiresAt}>{t('expires', { date: formatDateTime(openProposal.expiresAt) })}</time></p><p className="mt-1">{formatRelative(openProposal.expiresAt, now)}</p></div></div>
        <Link href={routes.app.proposal(openProposal.id)} className={buttonVariants({ variant: 'outline', className: 'shrink-0' })}>{t('viewProposal')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
      </div>
    </div>}
  </article>;
}

export function MyClientsScreen({ data, now }: MyClientsScreenProps) {
  const t = useTranslations('clients.list');
  return <div className="mx-auto w-full max-w-content space-y-section">
    <PageHeader title={t('title')} description={t('description')} />
    {!data.setup.bookable && <FinishSetupPanel setup={data.setup} />}
    {data.clients.length > 0
      ? <ul className="space-y-4">{data.clients.map((row) => <li key={row.client.id}><ClientRow row={row} now={now} /></li>)}</ul>
      : <EmptyState title={t('emptyTitle')} body={t('emptyBody')} icon={<Users className="size-6" />} action={{ label: t('findWork'), href: routes.app.findWork() }} />}
  </div>;
}
