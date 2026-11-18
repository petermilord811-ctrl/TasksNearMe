import { useId } from 'react';
import Link from 'next/link';
import { ChevronDown, Filter, History, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AdminAuditEntry, type AdminAuditPageData, type ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { cn } from '@/ui/lib/utils';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';
import { AdminCode, adminCard, adminSection, adminSelect, adminTableFrame, adminTd, adminTh, adminTr, AdminWhen } from './admin-ui';
import { UrlForm } from '@/ui/components/forms/url-form';

export interface AdminAuditScreenProps { data: AdminAuditPageData; now: ISODateTime }

const KNOWN_TARGETS = ['booking', 'task', 'support_case', 'user', 'reward_grant', 'offer', 'invite', 'payment'] as const;

function useTargetType() {
  const t = useTranslations('adminAudit');
  return (type: string) => ((KNOWN_TARGETS as readonly string[]).includes(type) ? t(`targetTypes.${type as (typeof KNOWN_TARGETS)[number]}`) : type);
}

function Actor({ entry }: { entry: AdminAuditEntry }) {
  const t = useTranslations('adminAudit');
  const roles = useTranslations('shell.roles');
  const { actor } = entry;
  if (actor.kind === 'system') return <span className="text-muted-foreground">{t('system')}</span>;
  if (actor.kind === 'member') return <span>{actor.person.displayName}<span className="block text-xs text-muted-foreground">{t('member')}</span></span>;
  const role = roles.has(actor.role as Parameters<typeof roles>[0]) ? roles(actor.role as Parameters<typeof roles>[0]) : actor.role;
  return <span>{t('staff', { name: actor.staff.displayName, role })}</span>;
}

function Target({ entry }: { entry: AdminAuditEntry }) {
  const typeLabel = useTargetType();
  const label = <><span className="block text-xs text-muted-foreground">{typeLabel(entry.target.type)}</span><span className="font-mono text-xs tabular-nums">{entry.target.id}</span></>;
  return entry.target.href
    ? <Link href={entry.target.href} className="inline-block min-h-11 rounded-md py-1 font-medium text-primary underline-offset-4 hover:underline">{label}</Link>
    : <span className="block">{label}</span>;
}

function Details({ entry }: { entry: AdminAuditEntry }) {
  const t = useTranslations('adminAudit');
  if (entry.details.length === 0) return null;
  return <details className="group mt-2 text-sm">
    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 py-2 font-medium text-primary [&::-webkit-details-marker]:hidden">
      <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-200 group-open:rotate-180" />{t('detailsCount', { count: entry.details.length })}
    </summary>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-foreground/[0.035] p-3 dark:bg-white/[0.04]">{entry.details.map((item) => <div key={item.key} className="contents"><dt className="font-mono text-xs text-muted-foreground">{item.key}</dt><dd className="font-mono text-xs break-all">{item.value}</dd></div>)}</dl>
  </details>;
}

function EntryRow({ entry, now, mobile = false }: { entry: AdminAuditEntry; now: ISODateTime; mobile?: boolean }) {
  const { formatRelative } = useFormat();
  const t = useTranslations('adminAudit');
  const when = <AdminWhen at={entry.at} title={formatRelative(entry.at, now)} />;
  const action = <AdminCode>{entry.action}</AdminCode>;
  const reason = entry.reason ? <p className="whitespace-pre-wrap">{entry.reason}</p> : <p className="text-muted-foreground">{t('noReason')}</p>;
  if (mobile) return <li className={cn(adminCard, 'space-y-3 text-sm')}>
    <div className="flex flex-wrap items-center justify-between gap-2">{action}<span className="tabular-nums text-muted-foreground">{when}</span></div>
    <dl className="grid grid-cols-2 gap-3">
      <div><dt className="text-muted-foreground">{t('columns.who')}</dt><dd><Actor entry={entry} /></dd></div>
      <div><dt className="text-muted-foreground">{t('columns.target')}</dt><dd><Target entry={entry} /></dd></div>
      <div className="col-span-2"><dt className="text-muted-foreground">{t('columns.reason')}</dt><dd>{reason}<Details entry={entry} /></dd></div>
    </dl>
  </li>;
  return <tr className={adminTr}>
    <td className={cn(adminTd, 'tabular-nums text-muted-foreground')}>{when}</td>
    <td className={adminTd}><Actor entry={entry} /></td>
    <th scope="row" className={cn(adminTd, 'text-left font-normal')}>{action}</th>
    <td className={adminTd}><Target entry={entry} /></td>
    <td className={adminTd}>{reason}<Details entry={entry} /></td>
  </tr>;
}

const WIDTHS = { when: 'w-[16%]', who: 'w-[16%]', action: 'w-[18%]', target: 'w-[16%]', reason: 'w-[34%]' } as const;

/** Staff (admins and support leads): the append-only audit log, newest first (UI-033). */
export function AdminAuditScreen({ data, now }: AdminAuditScreenProps) {
  const t = useTranslations('adminAudit');
  const typeLabel = useTargetType();
  const id = useId();
  const { filters } = data;
  const filtered = Object.values(filters).some(Boolean);
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <PageHeader title={t('title')} description={t('intro')} />
    <UrlForm urlKey={JSON.stringify(filters)} method="get" action={routes.admin.audit()} aria-label={t('filters')} className={cn(adminSection, 'space-y-4')}>
      <h2 className="flex items-center gap-2 font-display text-lg leading-6 font-semibold tracking-[-0.01em]"><Filter aria-hidden="true" className="size-4 text-muted-foreground" />{t('filters')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2"><Label htmlFor={`${id}-actor`}>{t('actor')}</Label><Input progressive id={`${id}-actor`} name="actor" defaultValue={filters.actor ?? ''} aria-describedby={`${id}-actor-hint`} /><p id={`${id}-actor-hint`} className="text-sm text-muted-foreground">{t('actorHint')}</p></div>
        <div className="space-y-2"><Label htmlFor={`${id}-action`}>{t('action')}</Label><select id={`${id}-action`} name="action" defaultValue={filters.action ?? ''} className={adminSelect}><option value="">{t('anyAction')}</option>{data.actionFamilies.map((family) => <option key={family} value={family}>{family}</option>)}{filters.action && !data.actionFamilies.includes(filters.action) && <option value={filters.action}>{filters.action}</option>}</select></div>
        <div className="space-y-2"><Label htmlFor={`${id}-type`}>{t('targetType')}</Label><select id={`${id}-type`} name="targetType" defaultValue={filters.targetType ?? ''} className={adminSelect}><option value="">{t('anyTarget')}</option>{data.targetTypes.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor={`${id}-target`}>{t('targetId')}</Label><Input progressive id={`${id}-target`} name="targetId" defaultValue={filters.targetId ?? ''} /></div>
        <div className="space-y-2"><Label htmlFor={`${id}-from`}>{t('from')}</Label><Input progressive id={`${id}-from`} name="from" type="date" defaultValue={filters.from ?? ''} className="tabular-nums" /></div>
        <div className="space-y-2"><Label htmlFor={`${id}-to`}>{t('to')}</Label><Input progressive id={`${id}-to`} name="to" type="date" defaultValue={filters.to ?? ''} className="tabular-nums" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-foreground/[0.07] pt-4 dark:border-white/[0.07]">
        <Button progressive type="submit"><Filter aria-hidden="true" className="size-4" />{t('apply')}</Button>
        {filtered && <Link href={routes.admin.audit()} className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline"><X aria-hidden="true" className="size-4" />{t('clear')}</Link>}
      </div>
    </UrlForm>
    <section aria-label={t('results')} className="space-y-3">
      <p className="text-sm font-medium tabular-nums text-muted-foreground">{t('count', { count: data.entries.length })}</p>
      {data.entries.length === 0 ? <EmptyState title={t('emptyTitle')} body={t('emptyBody')} icon={<History className="size-6" />} action={filtered ? { label: t('clear'), href: routes.admin.audit() } : undefined} /> : <>
        <div className={adminTableFrame}><table className="w-full table-fixed text-sm">
          <caption className="sr-only">{t('caption')}</caption>
          <thead><tr>{(['when', 'who', 'action', 'target', 'reason'] as const).map((column) => <th key={column} scope="col" className={cn(adminTh, WIDTHS[column])}>{t(`columns.${column}`)}</th>)}</tr></thead>
          <tbody>{data.entries.map((entry) => <EntryRow key={entry.id} entry={entry} now={now} />)}</tbody>
        </table></div>
        <ul className="space-y-3 lg:hidden">{data.entries.map((entry) => <EntryRow key={entry.id} entry={entry} now={now} mobile />)}</ul>
      </>}
      {data.nextCursor && <Link href={routes.admin.audit({ ...filters, before: data.nextCursor })} className={buttonVariants({ variant: 'outline' })}>{t('older')}</Link>}
    </section>
  </div>;
}
