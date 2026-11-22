import { useLocale, useTranslations } from 'next-intl';
import type { AdminIpLocation, AdminSignInRow, ISODateTime } from '@/contracts';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { adminH2, adminNote, adminPanel } from './admin-ui';

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

function SignInRow({ row, now }: { row: AdminSignInRow; now: ISODateTime }) {
  const t = useTranslations('adminUser.signIns');
  const locale = useLocale();
  const { formatDateTime, formatRelative } = useFormat();
  const { lookup } = row;
  const location = lookup?.status === 'found' ? lookup.location : undefined;
  const place = location ? (placeOf(location, locale) ?? t('placeUnknown')) : !row.ip ? t('noAddress') : lookup?.status === 'private' ? t('privateAddress') : t('unavailable');
  const { browser, os } = row.device;
  const device = browser && os ? t('device', { browser, os }) : (browser ?? os ?? t('deviceUnknown'));
  const badges = row.signUp || location?.anonymous || location?.hosting || row.expired;
  return <li className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
    <div className="min-w-0 space-y-1.5">
      <p className="text-sm font-medium">{place}</p>
      {location?.network && <p className="text-sm text-muted-foreground">{location.network}</p>}
      {badges && <div className="flex flex-wrap items-center gap-2">
        {row.signUp && <StatusBadge tone="info" label={t('signUp')} />}
        {location?.anonymous && <StatusBadge tone="warning" label={t('anonymous')} />}
        {location?.hosting && <StatusBadge tone="warning" label={t('hosting')} />}
        {row.expired && <StatusBadge tone="neutral" label={t('expired')} />}
      </div>}
      <p className="text-sm text-muted-foreground">{row.ip ? t.rich('addressLine', { address: row.ip, device, ip: (chunks) => <span className="font-mono text-foreground">{chunks}</span> }) : device}</p>
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
    <time dateTime={row.at} title={formatRelative(row.at, now)} className="text-sm tabular-nums text-muted-foreground">{formatDateTime(row.at)}</time>
  </li>;
}

/** Trust and safety, support leads and admins: the person's sign-ins and where each address is (ipinfo.io). */
export function AdminSignIns({ rows, now }: { rows: AdminSignInRow[]; now: ISODateTime }) {
  const t = useTranslations('adminUser.signIns');
  return <section aria-label={t('title')} className="space-y-3">
    <div><h2 className={adminH2}>{t('title')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('hint')}</p></div>
    {rows.length === 0
      ? <p className={adminNote}>{t('none')}</p>
      : <ul className={cn(adminPanel, 'divide-y divide-foreground/[0.07] px-4 sm:px-5 dark:divide-white/[0.07]')}>{rows.map((row) => <SignInRow key={row.id} row={row} now={now} />)}</ul>}
  </section>;
}
