import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { Check, Clock3, Flag, Hammer, Laptop, Leaf, MapPin, Package, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CategorySlug, HelperProfilePageData, HelperServiceDetail } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { AvailabilitySlotList } from '@/ui/components/availability/availability-slot-list';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { AchievementBadgeList } from '@/ui/components/people/achievement-badges';
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
    <li className="min-w-0 space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card md:p-5 dark:border-white/[0.06]">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: `color-mix(in oklab, var(--cat-${service.categorySlug}) 15%, transparent)`, color: `var(--cat-${service.categorySlug})` }}>
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <h3 className="font-display text-[17px]/6 font-semibold tracking-[-0.01em] md:text-lg/6.5">{t(`categories.${service.categorySlug}`)}</h3>
      </div>
      <p className="font-display text-lg font-semibold tracking-[-0.01em] tabular-nums">{price}</p>
      {service.description && <p className="text-sm leading-6 text-muted-foreground">{service.description}</p>}
    </li>
  );
}

export function HelperProfileScreen({ data }: HelperProfileScreenProps) {
  const { formatMonthYear } = useFormat();
  const t = useTranslations('helperProfile');
  const report = useTranslations('report');
  const { helper } = data;

  return (
    <div className="space-y-section">
      <header className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        {/* A soft brand band; the photo sits across its lower edge. */}
        <div aria-hidden="true" className="h-24 bg-[linear-gradient(115deg,var(--color-brand-soft),var(--color-clay-soft)_55%,var(--color-violet-soft))] md:h-32" />
        <div className="grid gap-6 px-card pb-card lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
          <div className="min-w-0 space-y-5">
            <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end md:-mt-14">
              <span className="w-fit shrink-0 rounded-full bg-card p-1 shadow-card">
                <InitialsAvatar initials={helper.initials} photo={helper.photo} size="xl" />
              </span>
              <div className="min-w-0 space-y-1 sm:pb-1">
                <h1 className="font-display text-2xl/8 font-semibold tracking-[-0.025em] break-words md:text-[32px]/10">{helper.displayName}</h1>
                {helper.headline && <p className="text-base leading-6">{helper.headline}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <p className="inline-flex items-start gap-2 text-muted-foreground">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{t('travelRadius', { miles: data.serviceRadiusMiles, area: helper.areaName })}</span>
              </p>
              {data.remoteOk && <p className="inline-flex items-center gap-2 rounded-full bg-badge-neutral px-3 py-1 text-badge-neutral-foreground"><Laptop aria-hidden="true" className="size-4" />{t('remoteOk')}</p>}
              {helper.foundingHelperNumber !== undefined && <p className="w-fit rounded-full bg-badge-brand px-3 py-1 font-medium tabular-nums text-badge-brand-foreground">{t('foundingHelper', { number: helper.foundingHelperNumber })}</p>}
            </div>
            <VerificationBadges badges={helper.badges} />
            {data.achievements && <AchievementBadgeList badges={data.achievements} />}
          </div>
          <div className="flex min-w-0 flex-col gap-4 border-t border-border pt-5 lg:mt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <RatingStars rating={helper.rating} />
            <ul className="grid grid-cols-2 gap-2 text-sm tabular-nums">
              <li className="rounded-xl bg-muted/60 p-3">
                <Check aria-hidden="true" className="mb-1 size-4 text-success" />
                <span>{t('completed', { count: helper.completedCount })}</span>
              </li>
              {helper.responseTimeMinutes !== undefined && <li className="rounded-xl bg-muted/60 p-3">
                <Clock3 aria-hidden="true" className="mb-1 size-4 text-muted-foreground" />
                <span>{t('responseTime', { minutes: helper.responseTimeMinutes })}</span>
              </li>}
            </ul>
            <p className="text-sm text-muted-foreground">{t('memberSince', { date: formatMonthYear(helper.memberSince) })}</p>
            <Link href={routes.app.requestHelper(helper.handle)} className={cn(buttonVariants({ size: 'lg' }), 'h-auto min-h-11 w-full whitespace-normal py-2.5 lg:mt-auto')}>{t('requestBooking', { name: helper.displayName })}</Link>
          </div>
        </div>
      </header>

      {data.slots && data.slots.length > 0 && <AvailabilitySlotList slots={data.slots} handle={helper.handle} />}

      <section aria-labelledby="helper-about-heading" className="max-w-reading space-y-3">
        <h2 id="helper-about-heading" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('about', { name: helper.displayName })}</h2>
        <p className="whitespace-pre-line break-words leading-7">{data.bio}</p>
      </section>

      <section aria-labelledby="helper-services-heading" className="space-y-4">
        <h2 id="helper-services-heading" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('services')}</h2>
        <ul className="grid gap-4 md:grid-cols-2">{data.services.map((service) => <ServiceCard key={service.categorySlug} service={service} />)}</ul>
      </section>

      {(data.tools.length > 0 || data.languages.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {data.tools.length > 0 && <section aria-labelledby="helper-tools-heading" className="space-y-3">
            <h2 id="helper-tools-heading" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('tools')}</h2>
            <ul className="flex flex-wrap gap-2">{data.tools.map((tool) => <li key={tool} className="rounded-full border border-foreground/[0.08] bg-card px-3 py-1.5 text-sm dark:border-white/[0.08]">{tool}</li>)}</ul>
          </section>}
          {data.languages.length > 0 && <section aria-labelledby="helper-languages-heading" className="space-y-3">
            <h2 id="helper-languages-heading" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('languages')}</h2>
            <ul className="flex flex-wrap gap-2">{data.languages.map((language) => <li key={language} className="rounded-full border border-foreground/[0.08] bg-card px-3 py-1.5 text-sm dark:border-white/[0.08]">{language}</li>)}</ul>
          </section>}
        </div>
      )}

      {data.workSamples.length > 0 && <section aria-labelledby="helper-work-heading" className="space-y-4">
        <h2 id="helper-work-heading" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('workSamples')}</h2>
        <WorkSampleGallery samples={data.workSamples} />
      </section>}

      <section aria-labelledby="helper-reviews-heading" className="space-y-4">
        <h2 id="helper-reviews-heading" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('reviews')}</h2>
        {helper.rating && data.reviews.length < helper.rating.count && <p className="text-sm tabular-nums text-muted-foreground">{t('recentReviews', { shown: data.reviews.length, total: helper.rating.count })}</p>}
        {data.reviews.length > 0
          ? <ul className="grid gap-4 md:grid-cols-2">{data.reviews.map((review) => <li key={review.id} className="min-w-0"><ReviewCard review={review} reportHref={routes.app.report('review', review.id)} /></li>)}</ul>
          : <div className="space-y-2 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card dark:border-white/[0.06]"><p className="font-medium">{t('noReviews')}</p><p className="text-sm text-muted-foreground">{t('noReviewsDescription')}</p></div>}
      </section>
      <p><Link href={routes.app.report('helper', helper.handle)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"><Flag aria-hidden="true" className="size-4" />{report('links.helper')}</Link></p>
    </div>
  );
}
