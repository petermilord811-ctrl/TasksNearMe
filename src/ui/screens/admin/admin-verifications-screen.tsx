import Link from 'next/link';
import { ArrowUpRight, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ADMIN_VERIFICATION_QUEUES, routes, type AdminVerificationsPageData, type ISODateTime } from '@/contracts';
import { formatDateTime, formatRelative } from '@/shared/format';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { cn } from '@/ui/lib/utils';

/**
 * `/admin/verifications`: proofs of address to review, ID checks waiting on staff, and background checks
 * to adjudicate. Each row opens the person's page, where the decisions are.
 */
export function AdminVerificationsScreen({ data, now }: { data: AdminVerificationsPageData; now: ISODateTime }) {
  const t = useTranslations('adminVerification');
  const home = useTranslations('verification.homeAddress');
  const rows = data.queue === 'address' ? data.address.length : data.queue === 'identity' ? data.identity.length : data.background.length;
  const when = (at: string) => <time dateTime={at} title={formatDateTime(at)} className="tabular-nums">{formatRelative(at, now)}</time>;
  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('queues.title')}</h1>
      <p className="text-muted-foreground">{t('queues.intro')}</p>
      {!data.canDecide && <p className="text-sm text-muted-foreground">{t('queues.readOnly')}</p>}
    </header>
    <nav aria-label={t('queues.label')}>
      <ul className="flex flex-wrap gap-2">
        {ADMIN_VERIFICATION_QUEUES.map((queue) => <li key={queue}><Link href={routes.admin.verifications(queue)} aria-current={data.queue === queue ? 'page' : undefined} className={cn('inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent', data.queue === queue ? 'border-primary bg-secondary text-secondary-foreground' : 'bg-card')}>
          {t(`queues.names.${queue}`)}<span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{data.counts[queue]}</span>
        </Link></li>)}
      </ul>
    </nav>
    {rows === 0 ? <p className="rounded-xl border bg-card p-5 text-muted-foreground">{t(`queues.empty.${data.queue}`)}</p> : <ul className="space-y-3">
      {data.queue === 'address' && data.address.map((row) => <li key={row.id}><Link href={routes.admin.user(row.person.id)} className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4 shadow-card hover:bg-accent sm:p-5">
        <InitialsAvatar initials={row.person.initials} size="md" />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2 font-semibold">{row.person.displayName}{row.overdue && <span className="inline-flex items-center gap-1 rounded-full bg-badge-warning px-2 py-0.5 text-xs font-medium text-badge-warning-foreground"><Clock aria-hidden="true" className="size-3" />{t('queues.overdue')}</span>}</span>
          <span className="block text-sm">{home(`documentTypes.${row.documentType}`)}{row.areaName ? ` · ${t('near', { area: row.areaName })}` : ''}</span>
          <span className="block text-sm text-muted-foreground">{t('queues.sent')} {when(row.submittedAt)}</span>
          {row.autoCheck && <span className="block text-sm text-muted-foreground">{row.autoCheck.readable && row.autoCheck.nameMatches && row.autoCheck.addressMatches && row.autoCheck.recent ? t('queues.autoAllMatch') : t('queues.autoCheckFlag')}</span>}
        </span>
        <ArrowUpRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </Link></li>)}
      {data.queue === 'identity' && data.identity.map((row) => <li key={row.id}><Link href={routes.admin.user(row.person.id)} className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4 shadow-card hover:bg-accent sm:p-5">
        <InitialsAvatar initials={row.person.initials} size="md" />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block font-semibold">{row.person.displayName}</span>
          <span className="block text-sm">{t(`queues.identityKinds.${row.kind}`)}</span>
          <span className="block text-sm text-muted-foreground tabular-nums">{t('attempts', { count: row.attempts })} · {when(row.at)}</span>
        </span>
        <ArrowUpRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </Link></li>)}
      {data.queue === 'background' && data.background.map((row) => <li key={row.id}><Link href={routes.admin.user(row.person.id)} className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4 shadow-card hover:bg-accent sm:p-5">
        <InitialsAvatar initials={row.person.initials} size="md" />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block font-semibold">{row.person.displayName}</span>
          <span className="block text-sm">{row.adjudication === 'pre_adverse' ? t('queues.preAdverse') : t('queues.toReview')}</span>
          <span className="block text-sm text-muted-foreground">{t('completedOn', { date: formatDateTime(row.completedAt) })}</span>
          {row.finalDecisionFrom && <span className="block text-sm text-muted-foreground">{t('finalDecisionFrom', { date: formatDateTime(row.finalDecisionFrom) })}</span>}
        </span>
        <ArrowUpRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </Link></li>)}
    </ul>}
  </div>;
}
