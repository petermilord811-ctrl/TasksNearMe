import { useTranslations } from 'next-intl';
import type { ISODateTime, OfferView, PricingInput } from '@/contracts';
import { formatDateTime, formatHours, formatMoney, formatRelative } from '@/shared/format';

export function OfferPrice({ pricing }: { pricing: PricingInput }) {
  const t = useTranslations('offers');
  return <span className="tabular-nums">{pricing.type === 'fixed'
    ? formatMoney(pricing.priceCents)
    : t('hourlyPrice', { rate: formatMoney(pricing.rateCents), cap: formatHours(pricing.hoursCap) })}</span>;
}

export function OfferExpiry({ offer, now }: { offer: OfferView; now: ISODateTime }) {
  const t = useTranslations('offers');
  return <time dateTime={offer.expiresAt} className="block text-sm tabular-nums text-muted-foreground">
    <span className="block">{t('expires', { relative: formatRelative(offer.expiresAt, now) })}</span>
    <span className="block">{formatDateTime(offer.expiresAt)}</span>
  </time>;
}

export function OfferBrings({ brings }: { brings: string[] }) {
  const t = useTranslations('offers');
  return brings.length > 0
    ? <ul className="list-inside list-disc space-y-1">{brings.map((item, index) => <li key={`${index}-${item}`} className="break-words">{item}</li>)}</ul>
    : <p className="text-muted-foreground">{t('nothingListed')}</p>;
}
