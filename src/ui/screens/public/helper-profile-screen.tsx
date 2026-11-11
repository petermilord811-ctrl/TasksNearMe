import Link from 'next/link';
import { Check, Clock3, Hammer, Laptop, Leaf, MapPin, Package, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CategorySlug, type HelperProfilePageData, type HelperServiceDetail } from '@/contracts';
import { formatHours, formatMoney, formatMonthYear } from '@/shared/format';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { WorkSampleGallery } from '@/ui/components/people/work-sample-gallery';
import { ReviewCard } from '@/ui/components/reviews/review-card';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';

export interface HelperProfileScreenProps {
  data: HelperProfilePageData;
}

const categoryIcons: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};

function ServiceCard({ service }: { service: HelperServiceDetail }) {
  const t = useTranslations('helperProfile');
  const Icon = categoryIcons[service.categorySlug];
  const price = service.pricingType === 'fixed' && service.fromPriceCents !== undefined
    ? t('fixedPrice', { amount: formatMoney(service.fromPriceCents) })
    : service.pricingType === 'hourly' && service.hourlyRateCents !== undefined
      ? service.minHours !== undefined
        ? t('hourlyMinimum', { amount: formatMoney(service.hourlyRateCents), hours: formatHours(service.minHours) })
        : t('hourlyPrice', { amount: formatMoney(service.hourlyRateCents) })
      : t('priceInOffer');

  return (
    <li className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 shadow-card md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <h3 className="text-[17px]/6 font-semibold md:text-lg/6.5">{t(`categories.${service.categorySlug}`)}</h3>
      </div>
      <p className="font-semibold tabular-nums">{price}</p>
      {service.description && <p className="text-sm leading-6 text-muted-foreground">{service.description}</p>}
    </li>
  );
}

export function HelperProfileScreen({ data }: HelperProfileScreenProps) {
  const t = useTranslations('helperProfile');
  const { helper } = data;

  return (
    <div className="space-y-section">
      <header className="rounded-xl border border-border bg-card p-card shadow-card">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
          <div className="min-w-0 space-y-5">
            <div className="flex items-start gap-4">
              <InitialsAvatar initials={helper.initials} size="lg" />
              <div className="min-w-0 space-y-2">
                <h1 className="text-2xl/8 font-bold md:text-[30px]/9.5">{helper.displayName}</h1>
                {helper.headline && <p className="text-base leading-6">{helper.headline}</p>}
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <p className="flex items-start gap-2 text-muted-foreground">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{t('travelRadius', { miles: data.serviceRadiusMiles, area: helper.areaName })}</span>
              </p>
              {data.remoteOk && <p className="inline-flex items-center gap-2 rounded-full bg-badge-neutral px-3 py-1 text-badge-neutral-foreground"><Laptop aria-hidden="true" className="size-4" />{t('remoteOk')}</p>}
              {helper.foundingHelperNumber !== undefined && <p className="w-fit rounded-full bg-badge-brand px-3 py-1 font-medium tabular-nums text-badge-brand-foreground">{t('foundingHelper', { number: helper.foundingHelperNumber })}</p>}
            </div>
            <VerificationBadges badges={helper.badges} />
          </div>
          <div className="flex min-w-0 flex-col gap-5 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <RatingStars rating={helper.rating} />
            <div className="space-y-3 text-sm tabular-nums text-muted-foreground">
              <p className="flex items-start gap-2"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{t('completed', { count: helper.completedCount })}</span></p>
              {helper.responseTimeMinutes !== undefined && <p className="flex items-start gap-2"><Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{t('responseTime', { minutes: helper.responseTimeMinutes })}</span></p>}
              <p>{t('memberSince', { date: formatMonthYear(helper.memberSince) })}</p>
            </div>
            <Link href={routes.app.requestHelper(helper.handle)} className={cn(buttonVariants(), 'w-full lg:mt-auto')}>{t('requestBooking', { name: helper.displayName })}</Link>
          </div>
        </div>
      </header>

      <section aria-labelledby="helper-about-heading" className="max-w-reading space-y-3">
        <h2 id="helper-about-heading" className="text-xl/7 font-semibold md:text-[22px]/7.5">{t('about', { name: helper.displayName })}</h2>
        <p className="whitespace-pre-line break-words leading-7">{data.bio}</p>
      </section>

      <section aria-labelledby="helper-services-heading" className="space-y-4">
        <h2 id="helper-services-heading" className="text-xl/7 font-semibold md:text-[22px]/7.5">{t('services')}</h2>
        <ul className="grid gap-4 md:grid-cols-2">{data.services.map((service) => <ServiceCard key={service.categorySlug} service={service} />)}</ul>
      </section>

      {(data.tools.length > 0 || data.languages.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {data.tools.length > 0 && <section aria-labelledby="helper-tools-heading" className="space-y-3">
            <h2 id="helper-tools-heading" className="text-xl/7 font-semibold md:text-[22px]/7.5">{t('tools')}</h2>
            <ul className="flex flex-wrap gap-2">{data.tools.map((tool) => <li key={tool} className="rounded-full bg-muted px-3 py-1.5 text-sm">{tool}</li>)}</ul>
          </section>}
          {data.languages.length > 0 && <section aria-labelledby="helper-languages-heading" className="space-y-3">
            <h2 id="helper-languages-heading" className="text-xl/7 font-semibold md:text-[22px]/7.5">{t('languages')}</h2>
            <ul className="flex flex-wrap gap-2">{data.languages.map((language) => <li key={language} className="rounded-full bg-muted px-3 py-1.5 text-sm">{language}</li>)}</ul>
          </section>}
        </div>
      )}

      {data.workSamples.length > 0 && <section aria-labelledby="helper-work-heading" className="space-y-4">
        <h2 id="helper-work-heading" className="text-xl/7 font-semibold md:text-[22px]/7.5">{t('workSamples')}</h2>
        <WorkSampleGallery samples={data.workSamples} />
      </section>}

      <section aria-labelledby="helper-reviews-heading" className="space-y-4">
        <h2 id="helper-reviews-heading" className="text-xl/7 font-semibold md:text-[22px]/7.5">{t('reviews')}</h2>
        {helper.rating && data.reviews.length < helper.rating.count && <p className="text-sm tabular-nums text-muted-foreground">{t('recentReviews', { shown: data.reviews.length, total: helper.rating.count })}</p>}
        {data.reviews.length > 0
          ? <ul className="grid gap-4 md:grid-cols-2">{data.reviews.map((review) => <li key={review.id} className="min-w-0"><ReviewCard review={review} /></li>)}</ul>
          : <div className="space-y-2 rounded-xl border border-border bg-card p-card"><p className="font-medium">{t('noReviews')}</p><p className="text-sm text-muted-foreground">{t('noReviewsDescription')}</p></div>}
      </section>
    </div>
  );
}
