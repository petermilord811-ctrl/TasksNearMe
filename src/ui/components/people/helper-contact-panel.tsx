'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, LockKeyhole, Mail, Phone } from 'lucide-react';
import { routes, type HelperContactAccess, type HelperContactReveal, type RevealHelperContactHandler } from '@/contracts';
import { formatUsPhone } from '@/shared/phone';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export interface HelperContactPanelProps {
  helperId: string;
  /** The helper's display name, "Jordan T.". */
  name: string;
  access: HelperContactAccess;
  onReveal: RevealHelperContactHandler;
  /** Seeds for the preview gallery: the answer to "Show" already in. */
  initialReveal?: HelperContactReveal;
}

/**
 * The contact details a helper shares with top Sparks levels (2026-11-24), on their profile. A neighbor who has earned
 * 2,000 Sparks taps "Show" to see them (they're not in the page until then); someone short of it sees how far they are,
 * with the Sparks page a new tab away.
 */
export function HelperContactPanel({ helperId, name, access, onReveal, initialReveal }: HelperContactPanelProps) {
  const t = useTranslations('helperContact');
  const { formatDateTime } = useFormat();
  // The page's language, never the browser's, so the server's HTML and the browser's agree ("2,000" in both).
  const locale = useLocale();
  const number = (value: number) => value.toLocaleString(locale === 'es' ? 'es-US' : 'en-US');
  const headingId = useId();
  const [reveal, setReveal] = useState<HelperContactReveal | undefined>(initialReveal);
  const [pending, setPending] = useState(false);
  const shares = access.shares.length > 1 ? 'both' : access.shares[0] ?? 'both';

  async function show() {
    if (pending) return;
    setPending(true);
    try {
      setReveal(await onReveal({ helperId }));
    } catch {
      setReveal({ ok: false, code: 'unknown' });
    } finally {
      setPending(false);
    }
  }

  const error = !reveal || reveal.ok
    ? ''
    : reveal.code === 'rate_limited'
      ? reveal.retryAt ? t('errors.rate_limited', { time: formatDateTime(reveal.retryAt) }) : t('errors.rate_limited_later')
      : t(`errors.${reveal.code}`);

  return <section aria-labelledby={headingId} className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
    <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
      {access.state === 'locked' ? <LockKeyhole aria-hidden="true" className="size-4 text-muted-foreground" /> : <Mail aria-hidden="true" className="size-4 text-primary" />}
      {t('heading')}
    </h2>
    {access.state === 'locked'
      ? <>
        <p className="text-sm text-muted-foreground">{t('locked.body', { name, shares, at: number(access.at) })}</p>
        <div className="space-y-1.5">
          <div role="progressbar" aria-label={t('locked.progressLabel')} aria-valuemin={0} aria-valuemax={access.at} aria-valuenow={Math.min(access.earned, access.at)} className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((access.earned / access.at) * 100))}%` }} />
          </div>
          <p className="text-sm tabular-nums">{t('locked.progress', { earned: number(access.earned), at: number(access.at) })}</p>
        </div>
        <Link href={routes.app.sparks()} target="_blank" className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-primary underline underline-offset-4">
          {t('locked.link')}<ExternalLink aria-hidden="true" className="size-3.5" /><span className="sr-only"> ({t('opensInNewTab')})</span>
        </Link>
      </>
      : reveal?.ok
        ? <>
          <ul className="space-y-1 text-sm">
            {reveal.email && <li><a href={`mailto:${reveal.email}`} aria-label={`${t('emailLabel')} ${reveal.email}`} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md font-medium text-primary underline underline-offset-4"><Mail aria-hidden="true" className="size-4 shrink-0" /><span className="break-all">{reveal.email}</span></a></li>}
            {reveal.phone && <li><a href={`tel:${reveal.phone}`} aria-label={`${t('phoneLabel')} ${formatUsPhone(reveal.phone)}`} className="inline-flex min-h-11 items-center gap-2 rounded-md font-medium tabular-nums text-primary underline underline-offset-4"><Phone aria-hidden="true" className="size-4 shrink-0" />{formatUsPhone(reveal.phone)}</a></li>}
          </ul>
          <p className="text-xs leading-5 text-muted-foreground">{t('revealed.note')} <Link href={`${routes.legal('terms')}#off-platform`} target="_blank" className="font-medium underline underline-offset-2">{t('revealed.terms')}<span className="sr-only"> ({t('opensInNewTab')})</span></Link></p>
        </>
        : <>
          <p className="text-sm text-muted-foreground">{t('reveal.body', { name, shares })}</p>
          <Button type="button" variant="outline" disabled={pending} onClick={() => void show()} className="h-auto min-h-11 w-full whitespace-normal py-2.5">
            {pending && <Spinner aria-hidden="true" className="size-4" />}
            {t('reveal.action', { shares })}
          </Button>
          <p role="alert" aria-live="assertive" className="text-sm text-destructive empty:hidden">{error}</p>
        </>}
  </section>;
}
