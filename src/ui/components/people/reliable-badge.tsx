import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * "Reliable" (HelperSummary.reliable, decided on the server): the helper kept their bookings over the last year. The
 * full meaning is in the accessible name and the tooltip; the pill stays short.
 */
export function ReliableBadge({ reliable }: { reliable?: boolean }) {
  const t = useTranslations('helperCard');
  if (!reliable) return null;
  return <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-success/25 bg-badge-success px-3 py-1 text-sm font-medium text-badge-success-foreground" title={t('reliableHint')}>
    <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
    <span aria-hidden="true">{t('reliable')}</span>
    <span className="sr-only">{t('reliableLabel')}</span>
  </p>;
}
