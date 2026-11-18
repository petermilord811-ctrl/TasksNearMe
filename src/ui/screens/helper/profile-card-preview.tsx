import { MapPin, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { HelperServicesInput, HelperSetupPerson } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { cn } from '@/ui/lib/utils';

/**
 * The helper's card as clients will see it in search and on offers (plan 9.11), drawn from what's typed in setup,
 * before anything is saved: photo or initials, name, neighborhood, headline and services with their prices.
 */
export function ProfileCardPreview({ person, headline, area, services, className }: {
  person: HelperSetupPerson;
  headline: string;
  area?: string;
  services: HelperServicesInput['services'];
  className?: string;
}) {
  const t = useTranslations('helperOnboarding.setup.about');
  const card = useTranslations('helperCard');
  return <div className={cn('space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card dark:border-white/[0.06]', className)}>
    <div className="flex items-start gap-3">
      <span className="shrink-0 rounded-full p-0.5 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_14%,transparent)]">
        <InitialsAvatar initials={person.initials} photo={person.photo} size="lg" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-display text-[17px]/6 font-semibold tracking-[-0.01em]">{person.displayName}</p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 shrink-0" />{area || t('noArea')}</p>
        <p className="inline-flex w-fit items-center gap-1 rounded-full bg-badge-brand px-2.5 py-0.5 text-xs font-medium text-badge-brand-foreground"><Sparkles aria-hidden="true" className="size-3" />{t('new')}</p>
      </div>
    </div>
    <p className={cn('text-sm leading-5 break-words', !headline.trim() && 'text-muted-foreground italic')}>{headline.trim() || t('noHeadline')}</p>
    {services.length > 0 && <dl aria-label={card('services')} className="space-y-3 border-t border-border pt-4 text-sm">
      {services.map((service) => <div key={service.categorySlug} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <dt>{card(`categories.${service.categorySlug}`)}</dt>
        <dd className="font-medium tabular-nums">
          {service.pricingType === 'fixed' && typeof service.fromPriceCents === 'number' && Number.isInteger(service.fromPriceCents) && service.fromPriceCents >= 0
            ? card('fixedPrice', { amount: formatMoney(service.fromPriceCents) })
            : service.pricingType === 'hourly' && typeof service.hourlyRateCents === 'number' && Number.isInteger(service.hourlyRateCents) && service.hourlyRateCents >= 0
              ? card('hourlyPrice', { amount: formatMoney(service.hourlyRateCents) })
              : card('priceInOffer')}
          {service.pricingType === 'hourly' && typeof service.minHours === 'number' && service.minHours > 0 && <span className="block text-sm font-normal text-muted-foreground">{card('minimumHours', { hours: formatHours(service.minHours) })}</span>}
        </dd>
      </div>)}
    </dl>}
  </div>;
}
