import { useId } from 'react';
import Link from 'next/link';
import { Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AdminAuditEntry, type AdminAuditPageData, type ISODateTime } from '@/contracts';
import { formatDateTime, formatRelative } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';

export interface AdminAuditScreenProps { data: AdminAuditPageData; now: ISODateTime }

const selectClass = 'min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
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
  const label = <><span className="block text-xs text-muted-foreground">{typeLabel(entry.target.type)}</span><span className="tabular-nums">{entry.target.id}</span></>;
  return entry.target.href
    ? <Link href={entry.target.href} className="inline-block min-h-11 rounded-md py-1 font-medium text-primary underline-offset-4 hover:underline">{label}</Link>
    : <span className="block">{label}</span>;
}

function Details({ entry }: { entry: AdminAuditEntry }) {
  const t = useTranslations('adminAudit');
  if (entry.details.length === 0) return null;
  return <details className="mt-2 text-sm">
    <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">{t('detailsCount', { count: entry.details.length })}</summary>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{entry.details.map((item) => <div key={item.key} className="contents"><dt className="font-mono text-xs text-muted-foreground">{item.key}</dt><dd className="font-mono text-xs break-all">{item.value}</dd></div>)}</dl>
  </details>;
}

function EntryRow({ entry, now, mobile = false }: { entry: AdminAuditEntry; now: ISODateTime; mobile?: boolean }) {
  const t = useTranslations('adminAudit');
  const when = <time dateTime={entry.at} title={formatRelative(entry.at, now)}>{formatDateTime(entry.at)}</time>;
  const action = <code className="rounded bg-muted px-1.5 py-0.5 text-sm break-all">{entry.action}</code>;
  const reason = entry.reason ? <p className="whitespace-pre-wrap">{entry.reason}</p> : <p className="text-muted-foreground">{t('noReason')}</p>;
  if (mobile) return <li className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-card text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">{action}<span className="tabular-nums text-muted-foreground">{when}</span></div>
    <dl className="grid grid-cols-2 gap-3">
      <div><dt className="text-muted-foreground">{t('columns.who')}</dt><dd><Actor entry={entry} /></dd></div>
      <div><dt className="text-muted-foreground">{t('columns.target')}</dt><dd><Target entry={entry} /></dd></div>
      <div className="col-span-2"><dt className="text-muted-foreground">{t('columns.reason')}</dt><dd>{reason}<Details entry={entry} /></dd></div>
    </dl>
  </li>;
  return <tr className="border-t align-top">
    <td className="p-3 tabular-nums">{when}</td>
    <td className="p-3"><Actor entry={entry} /></td>
    <th scope="row" className="p-3 text-left font-normal">{action}</th>
    <td className="p-3"><Target entry={entry} /></td>
    <td className="p-3">{reason}<Details entry={entry} /></td>
  </tr>;
}

/** Staff (admins and support leads): the append-only audit log, newest first (UI-033). */
export function AdminAuditScreen({ data, now }: AdminAuditScreenProps) {
  const t = useTranslations('adminAudit');
  const typeLabel = useTargetType();
  const id = useId();
  const { filters } = data;
  const filtered = Object.values(filters).some(Boolean);
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <header className="space-y-2"><h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1><p className="text-muted-foreground">{t('intro')}</p></header>
    <form method="get" action={routes.admin.audit()} aria-label={t('filters')} className="space-y-4 rounded-xl border bg-card p-4 shadow-card">
      <h2 className="font-heading text-lg font-semibold">{t('filters')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2"><Label htmlFor={`${id}-actor`}>{t('actor')}</Label><Input id={`${id}-actor`} name="actor" defaultValue={filters.actor ?? ''} aria-describedby={`${id}-actor-hint`} /><p id={`${id}-actor-hint`} className="text-sm text-muted-foreground">{t('actorHint')}</p></div>
        <div className="space-y-2"><Label htmlFor={`${id}-action`}>{t('action')}</Label><select id={`${id}-action`} name="action" defaultValue={filters.action ?? ''} className={selectClass}><option value="">{t('anyAction')}</option>{data.actionFamilies.map((family) => <option key={family} value={family}>{family}</option>)}{filters.action && !data.actionFamilies.includes(filters.action) && <option value={filters.action}>{filters.action}</option>}</select></div>
        <div className="space-y-2"><Label htmlFor={`${id}-type`}>{t('targetType')}</Label><select id={`${id}-type`} name="targetType" defaultValue={filters.targetType ?? ''} className={selectClass}><option value="">{t('anyTarget')}</option>{data.targetTypes.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor={`${id}-target`}>{t('targetId')}</Label><Input id={`${id}-target`} name="targetId" defaultValue={filters.targetId ?? ''} /></div>
        <div className="space-y-2"><Label htmlFor={`${id}-from`}>{t('from')}</Label><Input id={`${id}-from`} name="from" type="date" defaultValue={filters.from ?? ''} className="tabular-nums" /></div>
        <div className="space-y-2"><Label htmlFor={`${id}-to`}>{t('to')}</Label><Input id={`${id}-to`} name="to" type="date" defaultValue={filters.to ?? ''} className="tabular-nums" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3"><Button type="submit"><Filter aria-hidden="true" className="size-4" />{t('apply')}</Button>{filtered && <Link href={routes.admin.audit()} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('clear')}</Link>}</div>
    </form>
    <section aria-label={t('results')} className="space-y-3">
      <p className="text-sm font-medium tabular-nums text-muted-foreground">{t('count', { count: data.entries.length })}</p>
      {data.entries.length === 0 ? <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={filtered ? { label: t('clear'), href: routes.admin.audit() } : undefined} /> : <>
        <div className="hidden rounded-xl border bg-card shadow-card lg:block"><table className="w-full table-fixed text-sm">
          <caption className="sr-only">{t('caption')}</caption>
          <thead className="text-left text-muted-foreground"><tr>{(['when', 'who', 'action', 'target', 'reason'] as const).map((column) => <th key={column} scope="col" className={column === 'reason' ? 'w-[32%] p-3 font-medium' : column === 'action' ? 'w-[18%] p-3 font-medium' : 'w-[16%] p-3 font-medium'}>{t(`columns.${column}`)}</th>)}</tr></thead>
          <tbody>{data.entries.map((entry) => <EntryRow key={entry.id} entry={entry} now={now} />)}</tbody>
        </table></div>
        <ul className="space-y-3 lg:hidden">{data.entries.map((entry) => <EntryRow key={entry.id} entry={entry} now={now} mobile />)}</ul>
      </>}
      {data.nextCursor && <Link href={routes.admin.audit({ ...filters, before: data.nextCursor })} className="inline-flex min-h-11 items-center rounded-md border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent">{t('older')}</Link>}
    </section>
  </div>;
}
