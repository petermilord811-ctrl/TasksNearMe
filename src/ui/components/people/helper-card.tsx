import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { Clock3, MapPin, ThumbsUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { HelperSummary } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatHours, formatMoney } from '@/shared/format';
import { cn } from '@/ui/lib/utils';
import { InitialsAvatar } from './initials-avatar';
import { RatingStars } from './rating-stars';
import { ReliableBadge } from './reliable-badge';
import { VerificationBadges } from './verification-badges';
import { TopBadges } from './achievement-badges';

export interface HelperCardProps {
  helper: HelperSummary;
  /** `compact` once a price is on the table (an offer, a booking): who they are and why to trust them, without their services' prices. */
  variant?: 'compact' | 'full';
  /** The card's own actions (Ask, Save), inside it under a hairline (audit M35), not loose under its edge. */
  footer?: ReactNode;
}

export function HelperCard({ helper, variant = 'full', footer }: HelperCardProps) {
  const t = useTranslations('helperCard');
  // The numbered "Founding helper #63" line says it already; the same badge among the top three would repeat it (audit L14).
  const topBadges = helper.foundingHelperNumber !== undefined ? helper.topBadges?.filter((badge) => badge.code !== 'founding_helper') : helper.topBadges;

  return (
    <article className={cn('h-full min-w-0 space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card dark:border-white/[0.06]', variant === 'full' && 'md:p-5', footer !== undefined && 'flex flex-col space-y-0 gap-4')}>
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-full p-0.5 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_14%,transparent)]">
          <InitialsAvatar initials={helper.initials} photo={helper.photo} size={variant === 'full' ? 'lg' : 'md'} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[17px]/6 font-semibold tracking-[-0.01em] md:text-lg/6.5">
            {/* A deleted account's profile is gone (J-PR15): the name, with nowhere to link. */}
            {helper.deleted
              ? <span className="inline-flex min-h-11 items-center">{helper.displayName}</span>
              : <Link href={routes.helperProfile(helper.handle)} className="inline-flex min-h-11 items-center rounded-md hover:text-primary hover:underline underline-offset-4">
                {helper.displayName}
              </Link>}
          </h3>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 shrink-0" />{helper.areaName}</p>
        </div>
      </div>
      <p className="text-sm leading-5">{helper.headline}</p>
      {helper.foundingHelperNumber !== undefined && (
        <p className="w-fit rounded-full bg-badge-brand px-3 py-1 text-sm font-medium tabular-nums text-badge-brand-foreground">
          {t('foundingHelper', { number: helper.foundingHelperNumber })}
        </p>
      )}
      <ReliableBadge reliable={helper.reliable} />
      <VerificationBadges badges={helper.badges} compact variant="line" />
      <TopBadges badges={topBadges} />
      <div className="space-y-2">
        <RatingStars rating={helper.rating} />
        <p className="text-sm tabular-nums text-muted-foreground">{t('completed', { count: helper.completedCount })}</p>
        {helper.recommendedBy !== undefined && <p className="flex items-start gap-2 text-sm font-medium text-foreground"><ThumbsUp aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{t('recommendedBy', { count: helper.recommendedBy })}</span></p>}
        {helper.responseTime !== undefined && (
          <p className="flex items-start gap-2 text-sm tabular-nums text-muted-foreground">
            <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t('responseTime', { range: helper.responseTime })}</span>
          </p>
        )}
      </div>
      {variant === 'full' && <dl aria-label={t('services')} className="space-y-3 border-t border-border pt-4 text-sm">
        {helper.services.map((service) => (
          <div key={service.categorySlug} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <dt>{t(`categories.${service.categorySlug}`)}</dt>
            <dd className="font-medium tabular-nums">
              {service.pricingType === 'fixed' && service.fromPriceCents !== undefined
                ? t('fixedPrice', { amount: formatMoney(service.fromPriceCents) })
                : service.pricingType === 'hourly' && service.hourlyRateCents !== undefined
                  ? t('hourlyPrice', { amount: formatMoney(service.hourlyRateCents) })
                  : t('priceInOffer')}
              {service.pricingType === 'hourly' && service.minHours !== undefined && (
                <span className="block text-sm font-normal text-muted-foreground">{t('minimumHours', { hours: formatHours(service.minHours) })}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>}
      {footer !== undefined && <div className="mt-auto border-t border-border pt-4">{footer}</div>}
    </article>
  );
}
