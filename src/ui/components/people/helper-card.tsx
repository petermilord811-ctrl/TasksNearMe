import Link from 'next/link';
import { Clock3, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type HelperSummary } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { cn } from '@/ui/lib/utils';
import { InitialsAvatar } from './initials-avatar';
import { RatingStars } from './rating-stars';
import { VerificationBadges } from './verification-badges';

export interface HelperCardProps {
  helper: HelperSummary;
  variant?: 'compact' | 'full';
}

export function HelperCard({ helper, variant = 'full' }: HelperCardProps) {
  const t = useTranslations('helperCard');

  return (
    <article className={cn('h-full min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 shadow-card', variant === 'full' && 'md:p-5')}>
      <div className="flex items-start gap-3">
        <InitialsAvatar initials={helper.initials} photo={helper.photo} size={variant === 'full' ? 'lg' : 'md'} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px]/6 font-semibold md:text-lg/6.5">
            <Link href={routes.helperProfile(helper.handle)} className="inline-flex min-h-11 items-center rounded-md hover:text-primary hover:underline underline-offset-4">
              {helper.displayName}
            </Link>
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
      <VerificationBadges badges={helper.badges} compact />
      <div className="space-y-2">
        <RatingStars rating={helper.rating} />
        <p className="text-sm tabular-nums text-muted-foreground">{t('completed', { count: helper.completedCount })}</p>
        {helper.responseTimeMinutes !== undefined && (
          <p className="flex items-start gap-2 text-sm tabular-nums text-muted-foreground">
            <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t('responseTime', { minutes: helper.responseTimeMinutes })}</span>
          </p>
        )}
      </div>
      <dl aria-label={t('services')} className="space-y-3 border-t border-border pt-4 text-sm">
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
      </dl>
    </article>
  );
}
