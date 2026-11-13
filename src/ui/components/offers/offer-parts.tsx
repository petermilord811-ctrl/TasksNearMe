import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ISODateTime, OfferView, PricingInput } from '@/contracts';
import { formatDateTime, formatHours, formatMoney, formatRelative } from '@/shared/format';

export function OfferPrice({ pricing }: { pricing: PricingInput }) {
  const t = useTranslations('offers');
  return <span className="tabular-nums">{pricing.type === 'fixed'
    ? formatMoney(pricing.priceCents)
    : t('hourlyPrice', { rate: formatMoney(pricing.rateCents), cap: formatHours(pricing.hoursCap) })}</span>;
}

/** When the offer runs out: "Expires in 3 days", then the exact time. */
export function OfferExpiry({ offer, now }: { offer: OfferView; now: ISODateTime }) {
  const t = useTranslations('offers');
  return <time dateTime={offer.expiresAt} className="flex items-start gap-2 text-sm tabular-nums text-muted-foreground">
    <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
    <span>
      <span className="block">{t('expires', { relative: formatRelative(offer.expiresAt, now) })}</span>
      <span className="block">{formatDateTime(offer.expiresAt)}</span>
    </span>
  </time>;
}

/** What the helper brings, as small chips (a list for screen readers). */
export function OfferBrings({ brings }: { brings: string[] }) {
  const t = useTranslations('offers');
  return brings.length > 0
    ? <ul className="flex flex-wrap gap-2">{brings.map((item, index) => <li key={`${index}-${item}`} className="max-w-full break-words rounded-full border border-foreground/[0.08] bg-foreground/[0.035] px-3 py-1 text-sm dark:border-white/[0.08] dark:bg-white/[0.045]">{item}</li>)}</ul>
    : <p className="text-muted-foreground">{t('nothingListed')}</p>;
}
