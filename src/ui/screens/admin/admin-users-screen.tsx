import { useId } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AdminUserRow, type AdminUsersPageData, type ISODateTime } from '@/contracts';
import { formatMonthYear, formatRelative } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';
import { AdminHelperBadge, AdminUserRoles } from './admin-user-summary';
import { adminCardLink, adminSection, adminTableFrame, adminTd, adminTh, adminTr } from './admin-ui';

export interface AdminUsersScreenProps { data: AdminUsersPageData; now: ISODateTime }

function PersonName({ row, now }: { row: AdminUserRow; now: ISODateTime }) {
  const t = useTranslations('adminUsers');
  return <div className="flex min-w-0 items-center gap-3">
    <InitialsAvatar initials={row.person.initials} size="sm" />
    <div className="min-w-0"><span className="font-semibold text-foreground group-hover:text-primary">{row.person.displayName}</span><span className="mt-0.5 block text-sm text-muted-foreground"><time dateTime={row.person.memberSince} title={formatRelative(row.person.memberSince, now)}>{t('memberSince', { date: formatMonthYear(row.person.memberSince) })}</time></span></div>
  </div>;
}

/** A count that matters when it isn't zero (open cases, strikes). */
function Count({ value, alert = false }: { value: number; alert?: boolean }) {
  return <span className={cn('tabular-nums', value === 0 ? 'text-muted-foreground' : alert ? 'font-semibold text-destructive' : 'font-semibold')}>{value}</span>;
}

const WIDTHS = { person: 'w-[22%]', email: 'w-[24%]', roles: 'w-[18%]', helperStatus: 'w-[18%]', openCases: 'w-[9%] text-right', strikes: 'w-[9%] text-right' } as const;

/** Staff: search people by name, email or id; a table on wide screens, cards on phones. */
export function AdminUsersScreen({ data, now }: AdminUsersScreenProps) {
  const t = useTranslations('adminUsers');
  const id = useId();
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <PageHeader title={t('title')} description={t('intro')} />
    <form method="get" action={routes.admin.users(data.query)} role="search" aria-label={t('search')} className={cn(adminSection, 'space-y-2')}>
      <Label htmlFor={`${id}-search`}>{t('search')}</Label>
      <div className="flex flex-col gap-2 sm:flex-row"><Input key={data.query} id={`${id}-search`} name="q" type="search" defaultValue={data.query} aria-describedby={`${id}-hint`} className="min-w-0 flex-1" /><Button type="submit"><Search aria-hidden="true" className="size-4" />{t('submitSearch')}</Button></div>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('searchHint')}</p>
    </form>
    <section aria-label={t('results')} className="space-y-3">
      <p className="text-sm font-medium tabular-nums text-muted-foreground">{t('count', { count: data.totalCount })}</p>
      {data.rows.length === 0 ? <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={{ label: t('clearSearch'), href: routes.admin.users() }} /> : <>
        <div className={adminTableFrame}><table className="w-full table-fixed text-sm">
          <caption className="sr-only">{t('caption')}</caption>
          <thead><tr>{(['person', 'email', 'roles', 'helperStatus', 'openCases', 'strikes'] as const).map((column) => <th key={column} scope="col" className={cn(adminTh, WIDTHS[column])}>{t(`columns.${column}`)}</th>)}</tr></thead>
          <tbody>{data.rows.map((row) => <tr key={row.id} className={adminTr}>
            <th scope="row" className={cn(adminTd, 'text-left font-normal')}><Link href={routes.admin.user(row.id)} className="group block min-h-11 rounded-md py-1 underline-offset-4 hover:underline"><PersonName row={row} now={now} /></Link></th>
            <td className={cn(adminTd, 'break-all')}>{row.email}</td>
            <td className={adminTd}><AdminUserRoles roles={row.roles} /></td>
            <td className={adminTd}><AdminHelperBadge status={row.helperStatus} /></td>
            <td className={cn(adminTd, 'text-right')}><Count value={row.openCases} /></td>
            <td className={cn(adminTd, 'text-right')}><Count value={row.strikes} alert /></td>
          </tr>)}</tbody>
        </table></div>
        <ul className="space-y-3 lg:hidden">{data.rows.map((row) => <li key={row.id}><Link href={routes.admin.user(row.id)} className={cn(adminCardLink, 'group space-y-3')}>
          <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><PersonName row={row} now={now} /></div><ChevronRight aria-hidden="true" className="mt-2 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" /></div>
          <p className="text-sm break-all">{row.email}</p>
          <AdminHelperBadge status={row.helperStatus} />
          <dl className="grid grid-cols-2 gap-3 border-t border-foreground/[0.07] pt-3 text-sm dark:border-white/[0.07]"><div className="col-span-2 space-y-1"><dt className="text-muted-foreground">{t('columns.roles')}</dt><dd><AdminUserRoles roles={row.roles} /></dd></div><div><dt className="text-muted-foreground">{t('columns.openCases')}</dt><dd><Count value={row.openCases} /></dd></div><div><dt className="text-muted-foreground">{t('columns.strikes')}</dt><dd><Count value={row.strikes} alert /></dd></div></dl>
        </Link></li>)}</ul>
      </>}
    </section>
  </div>;
}
