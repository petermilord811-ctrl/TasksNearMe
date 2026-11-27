import { useLocale, useTranslations } from 'next-intl';
import type { AdminDetectedIp, AdminFraudView, AdminIpLocation, BadgeTone, FraudFactor, FraudLevel, FraudScore, ISODateTime } from '@/contracts';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { adminH2, adminNote, adminPanel, adminSection } from './admin-ui';

/**
 * Fraud scores for staff (owner, 2026-11-27): a badge for a score, the reasons behind it, the person's final score with
 * each area's, and every address they used with ipinfo.io's answer and its score. The app computes every score; this
 * only shows them. No 'use client': it renders on the person page (server) and in the verification section (client).
 */

const TONES: Record<FraudLevel, BadgeTone> = { low: 'success', medium: 'warning', high: 'danger' };
const NUMBER_TONES: Record<FraudLevel, string> = { low: 'text-success', medium: 'text-warning', high: 'text-destructive' };

/** "Fraud 72 · High". */
export function FraudBadge({ fraud, size = 'sm' }: { fraud: FraudScore; size?: 'sm' | 'md' }) {
  const t = useTranslations('adminFraud');
  return <StatusBadge tone={TONES[fraud.level]} size={size} label={t('badge', { score: fraud.score, level: t(`levels.${fraud.level}`) })} />;
}

/** The reasons, biggest first, each with what it adds. */
export function FraudFactors({ factors, className }: { factors: readonly FraudFactor[]; className?: string }) {
  const t = useTranslations('adminFraud');
  if (factors.length === 0) return <p className={cn('text-sm text-muted-foreground', className)}>{t('nothingFound')}</p>;
  return <ul className={cn('space-y-1 text-sm', className)}>
    {factors.map((factor) => <li key={factor.key} className="flex items-baseline justify-between gap-3">
      <span className="min-w-0">{t(`factors.${factor.key}`, { count: factor.count ?? 0 })}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{t('points', { points: factor.points })}</span>
    </li>)}
  </ul>;
}

/** A score with its reasons, as the ID and address cards and the queues show it. */
export function FraudScoreLine({ fraud }: { fraud: FraudScore }) {
  return <div className="space-y-2">
    <FraudBadge fraud={fraud} />
    {fraud.factors.length > 0 && <FraudFactors factors={fraud.factors} />}
  </div>;
}

/** The person page's "Fraud score": the final score, then each area's. */
export function AdminFraudSummary({ view }: { view: AdminFraudView }) {
  const t = useTranslations('adminFraud');
  const { fraud } = view;
  return <section aria-label={t('title')} className={cn(adminSection, 'space-y-4')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 className={adminH2}>{t('title')}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{t('hint')}</p>
      </div>
      <p className="flex items-baseline gap-2">
        <span className="sr-only">{t('badge', { score: fraud.score, level: t(`levels.${fraud.level}`) })}</span>
        <span aria-hidden="true" className={cn('font-display text-4xl leading-none font-semibold tabular-nums', NUMBER_TONES[fraud.level])}>{fraud.score}</span>
        <span aria-hidden="true" className="text-sm text-muted-foreground">{t('outOf')}</span>
        <span aria-hidden="true"><StatusBadge tone={TONES[fraud.level]} size="sm" label={t(`levels.${fraud.level}`)} /></span>
      </p>
    </div>
    <ul className="grid gap-3 border-t border-foreground/[0.07] pt-4 sm:grid-cols-2 dark:border-white/[0.07]">
      {view.areas.map(({ area, fraud: score }) => <li key={area} className="min-w-0 space-y-2 rounded-xl border border-foreground/[0.06] p-3 dark:border-white/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t(`areas.${area}`)}</h3>
          {score ? <FraudBadge fraud={score} /> : <span className="text-sm text-muted-foreground">{t(`notScored.${area}`)}</span>}
        </div>
        {score && <FraudFactors factors={score.factors} />}
      </li>)}
    </ul>
  </section>;
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** City, region and country, each name once ("Singapore, Singapore" reads as "Singapore"). */
function placeOf(location: AdminIpLocation, locale: string): string | undefined {
  const parts = [location.city, location.region, location.countryCode ? countryName(location.countryCode, locale) : undefined]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.indexOf(part) === index);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function IpRow({ row, now }: { row: AdminDetectedIp; now: ISODateTime }) {
  const t = useTranslations('adminFraud.ips');
  const locale = useLocale();
  const { formatDateTime, formatRelative } = useFormat();
  const { lookup } = row;
  const location = lookup?.status === 'found' ? lookup.location : undefined;
  const place = location ? (placeOf(location, locale) ?? t('placeUnknown')) : !lookup ? t('notLookedUp') : lookup.status === 'private' ? t('privateAddress') : t('unavailable');
  const browser = row.device?.browser;
  const os = row.device?.os;
  const device = browser && os ? t('device', { browser, os }) : (browser ?? os ?? t('deviceUnknown'));
  const sources = new Intl.ListFormat(locale, { type: 'conjunction' }).format(row.seenIn.map((source) => t(`sources.${source}`)));
  const flagged = row.network && row.network !== 'residential' && row.network !== 'mobile';
  return <li className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
    <div className="min-w-0 space-y-1.5">
      <p className="text-sm font-medium">{place}</p>
      {location?.network && <p className="text-sm text-muted-foreground">{location.network}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {row.fraud && <FraudBadge fraud={row.fraud} />}
        {row.network && <StatusBadge tone={flagged ? 'warning' : 'neutral'} size="sm" label={t(`networks.${row.network}`)} />}
        {row.signUp && <StatusBadge tone="info" size="sm" label={t('signUp')} />}
        {row.active && <StatusBadge tone="success" size="sm" label={t('active')} />}
      </div>
      {row.fraud && row.fraud.factors.length > 0 && <FraudFactors factors={row.fraud.factors} className="max-w-md" />}
      {!row.fraud && lookup && lookup.status !== 'private' && <p className="text-sm text-muted-foreground">{t('noScore')}</p>}
      <p className="text-sm text-muted-foreground">{t.rich('addressLine', { address: row.ip, device, ip: (chunks) => <span className="font-mono text-foreground">{chunks}</span> })}</p>
      <p className="text-sm text-muted-foreground">{t('signIns', { count: row.signIns })}{' · '}{t('seenIn', { sources })}{row.way ? <>{' · '}{t('way', { way: t(`ways.${row.way}`) })}</> : null}</p>
      <p className="text-sm text-muted-foreground"><time dateTime={row.firstSeenAt}>{t('seen', { first: formatDateTime(row.firstSeenAt), last: formatRelative(row.lastSeenAt, now) })}</time></p>
      {lookup?.status === 'unavailable' && <p className="text-sm text-muted-foreground">{t(`unavailableReasons.${lookup.reason}`)}</p>}
      {location?.hostname && <p className="break-all text-sm text-muted-foreground">{t('hostname', { hostname: location.hostname })}</p>}
      {row.ipinfoUrl && <a href={row.ipinfoUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">
        {t('ipinfoLink')}{' '}<span className="sr-only">({t('opensInNewTab')})</span>
      </a>}
      {row.userAgent && <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md font-medium text-primary">{t('browserDetails')}</summary>
        <p className="break-all pb-1 font-mono text-xs text-muted-foreground">{row.userAgent}</p>
      </details>}
    </div>
    <time dateTime={row.lastSeenAt} title={formatRelative(row.lastSeenAt, now)} className="text-sm tabular-nums text-muted-foreground">{formatDateTime(row.lastSeenAt)}</time>
  </li>;
}

/** Every address the person used (owner, 2026-11-27: "show all detected ips"), newest first, each with its score. */
export function AdminDetectedIps({ view, now }: { view: AdminFraudView; now: ISODateTime }) {
  const t = useTranslations('adminFraud.ips');
  return <section aria-label={t('title')} className="space-y-3">
    <div><h2 className={adminH2}>{t('title')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('hint')}</p></div>
    {view.ips.length === 0
      ? <p className={adminNote}>{t('none')}</p>
      : <>
        <ul className={cn(adminPanel, 'divide-y divide-foreground/[0.07] px-4 sm:px-5 dark:divide-white/[0.07]')}>{view.ips.map((row) => <IpRow key={row.ip} row={row} now={now} />)}</ul>
        {view.ipsTotal > view.ips.length && <p className="text-sm text-muted-foreground">{t('more', { shown: view.ips.length, total: view.ipsTotal })}</p>}
      </>}
  </section>;
}
