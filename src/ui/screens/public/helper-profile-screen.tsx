import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { BadgeCheck, Cake, Flag, Hammer, Laptop, Leaf, MapPin, MessageCircle, MessagesSquare, Package, Sparkles, Star, ThumbsUp, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { CategorySlug, HelperContactAccess, HelperContactReveal, HelperProfilePageData, HelperServiceDetail, ISODateTime, RevealHelperContactHandler } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatHours, formatMoney } from '@/shared/format';
import { AvailabilitySlotList } from '@/ui/components/availability/availability-slot-list';
import { NeighborhoodDayList } from '@/ui/components/availability/neighborhood-day-card';
import { ExpandableText } from '@/ui/components/community/expandable-text';
import { CakeDayMark, useAccountAge } from '@/ui/components/people/account-age';
import { AchievementBadgeList } from '@/ui/components/people/achievement-badges';
import { HelperContactPanel } from '@/ui/components/people/helper-contact-panel';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { NeighborsAnswers } from '@/ui/components/people/neighbors-answers';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { SparksBadge } from '@/ui/components/people/sparks-badge';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { WorkSampleGallery } from '@/ui/components/people/work-sample-gallery';
import { ReviewCard } from '@/ui/components/reviews/review-card';
import { ReviewSummaryCard } from '@/ui/components/reviews/review-summary';
import { PublicThankYouNotes } from '@/ui/components/thanks/public-thank-you-notes';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';

export interface HelperProfileScreenProps {
  data: HelperProfilePageData;
  /** The request's time (the page's `requestNow()`), for the account age. Never part of the cached `data`. */
  now: ISODateTime;
  /**
   * The contact details the helper shares with top Sparks levels, for this viewer (2026-11-24): worked out per visit,
   * never part of the cached `data`. Shown with `onRevealContact`.
   */
  contact?: HelperContactAccess;
  onRevealContact?: RevealHelperContactHandler;
  /** Seeds for the preview gallery: "Show" already answered. */
  initialContactReveal?: HelperContactReveal;
}

const categoryIcons: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};

const sectionHeading = 'font-display text-xl/7 font-semibold tracking-[-0.015em]';

/**
 * One section of the profile's main column: its heading (with anything that belongs beside it, like the rating),
 * then its content. Sections sit one under the other, a hairline apart.
 */
export function ProfileSection({ id, title, aside, children, className }: { id: string; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section aria-labelledby={id} className={cn('space-y-4', className)}>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id={id} className={sectionHeading}>{title}</h2>
      {aside}
    </div>
    {children}
  </section>;
}

function ServiceRow({ service }: { service: HelperServiceDetail }) {
  const t = useTranslations('helperProfile');
  const Icon = categoryIcons[service.categorySlug];
  const price = service.pricingType === 'fixed' && service.fromPriceCents !== undefined
    ? t('fixedPrice', { amount: formatMoney(service.fromPriceCents) })
    : service.pricingType === 'hourly' && service.hourlyRateCents !== undefined
      ? service.minHours !== undefined
        ? t('hourlyMinimum', { amount: formatMoney(service.hourlyRateCents), hours: formatHours(service.minHours) })
        : t('hourlyPrice', { amount: formatMoney(service.hourlyRateCents) })
      : t('priceInOffer');
  return <li className="flex min-w-0 gap-3.5 p-4 md:gap-4 md:px-5">
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, var(--cat-${service.categorySlug}) 15%, transparent)`, color: `var(--cat-${service.categorySlug})` }}>
      <Icon className="size-5" />
    </span>
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h3 className="font-semibold leading-6">{t(`categories.${service.categorySlug}`)}</h3>
        <p className="font-display text-[15px]/6 font-semibold tabular-nums">{price}</p>
      </div>
      {service.description && <p className="text-sm leading-6 text-muted-foreground">{service.description}</p>}
    </div>
  </li>;
}

/**
 * One number in the top card's row, Reddit-style: the value over its label. `spoken*`: what a screen reader hears
 * instead. `mark`: an icon after the value that speaks for itself (the cake on a cake day).
 */
function Stat({ value, label, spokenValue, spokenLabel, tip, mark }: { value: ReactNode; label: string; spokenValue?: string; spokenLabel?: string; tip?: string; mark?: ReactNode }) {
  // Values line up across the row even when a label takes two lines (a long word on a 360 px phone, in Spanish).
  return <div title={tip} className="flex min-w-0 flex-col items-center justify-start gap-0.5 px-1 py-3 text-center sm:px-1.5">
    <dt className="order-2 text-[11px] leading-[14px] text-muted-foreground sm:text-xs sm:leading-4">
      {spokenLabel ? <><span aria-hidden="true">{label}</span><span className="sr-only">{spokenLabel}</span></> : label}
    </dt>
    <dd className="order-1 inline-flex items-center gap-1 font-display text-lg/6 font-semibold tabular-nums">
      {spokenValue ? <><span aria-hidden="true" className="inline-flex items-center gap-1">{value}</span><span className="sr-only">{spokenValue}</span></> : value}
      {mark}
    </dd>
  </div>;
}

/** Rating, tasks done, how fast they reply, and how long they've been here: the four things people compare first. */
function ProfileStats({ data, now }: { data: HelperProfilePageData; now: ISODateTime }) {
  const t = useTranslations('helperProfile');
  const verification = useTranslations('verification');
  const { helper } = data;
  const age = useAccountAge(helper.memberSince, now);
  return <dl className="grid auto-cols-fr grid-flow-col divide-x divide-border rounded-2xl border border-border bg-background/60 dark:bg-white/[0.03]">
    {helper.rating
      ? <Stat
          value={<><Star aria-hidden="true" className="size-4 fill-current text-warning" />{helper.rating.average.toFixed(1)}</>}
          label={t('stats.reviews', { count: helper.rating.count })}
          spokenValue={verification('ratingSummary', { average: helper.rating.average, count: helper.rating.count })}
          spokenLabel={t('stats.rating')}
        />
      : <Stat value={verification('new')} label={t('stats.rating')} />}
    <Stat value={helper.completedCount.toLocaleString()} label={t('stats.tasksDone')} spokenValue={t('completed', { count: helper.completedCount })} />
    {helper.responseTime !== undefined && <Stat value={t('stats.responseValue', { range: helper.responseTime })} label={t('stats.response')} spokenValue={t('responseTime', { range: helper.responseTime })} />}
    <Stat value={age.value} label={age.label} spokenValue={age.spoken} tip={age.tip} mark={age.age.cakeDay && <CakeDayMark label={age.cakeDay} />} />
  </dl>;
}

/** The facts people look up rather than compare: when they joined, their Sparks, the languages they speak, their tools. */
function ProfileDetails({ data, now }: { data: HelperProfilePageData; now: ISODateTime }) {
  const t = useTranslations('helperProfile');
  const report = useTranslations('report');
  const { helper } = data;
  const age = useAccountAge(helper.memberSince, now);
  const chips = 'flex flex-wrap gap-1.5';
  const chip = 'rounded-full border border-foreground/[0.08] bg-background px-2.5 py-1 text-sm leading-5 dark:border-white/[0.08] dark:bg-white/[0.04]';
  return <div className="space-y-4">
    <section aria-labelledby="helper-details-heading" className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 id="helper-details-heading" className="font-display text-base/6 font-semibold tracking-[-0.01em]">{t('details')}</h2>
      <dl className="space-y-3 text-sm">
        <div className="space-y-0.5">
          <dt className="flex items-center gap-2 text-muted-foreground"><Cake aria-hidden="true" className="size-4 shrink-0" />{age.cakeDay}</dt>
          <dd className="pl-6 font-medium tabular-nums">{age.joinedOn}</dd>
        </div>
        {data.sparks && <div className="space-y-1">
          <dt className="flex items-center gap-2 text-muted-foreground"><Sparkles aria-hidden="true" className="size-4 shrink-0" />{t('sparks')}</dt>
          <dd className="pl-6"><SparksBadge sparks={data.sparks} compact /></dd>
        </div>}
      </dl>
      {data.languages.length > 0 && <section aria-labelledby="helper-languages-heading" className="space-y-2">
        <h3 id="helper-languages-heading" className="text-sm font-semibold">{t('languages')}</h3>
        <ul className={chips}>{data.languages.map((language) => <li key={language} className={chip}>{language}</li>)}</ul>
      </section>}
      {data.tools.length > 0 && <section aria-labelledby="helper-tools-heading" className="space-y-2">
        <h3 id="helper-tools-heading" className="text-sm font-semibold">{t('tools')}</h3>
        <ul className={chips}>{data.tools.map((tool) => <li key={tool} className={chip}>{tool}</li>)}</ul>
      </section>}
    </section>
    <p className="px-1"><Link href={routes.app.report('helper', helper.handle)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"><Flag aria-hidden="true" className="size-4" />{report('links.helper')}</Link></p>
  </div>;
}

/**
 * A helper's public profile (owner, 2026-11-27: "clear focusing on important things first. Professional layout and
 * useful for other users", "simple as LinkedIn profile page"). First the top card: who they are, the four numbers
 * people compare (rating, tasks done, how fast they reply, account age), what's verified, their badges. Then what
 * they do and for how much, when they're free, what neighbors say, their own words, their work. On wide screens the
 * buttons and the details sit in a card beside it that stays in view; on phones the buttons stay in reach at the
 * bottom.
 */
export function HelperProfileScreen({ data, now, contact, onRevealContact, initialContactReveal }: HelperProfileScreenProps) {
  const t = useTranslations('helperProfile');
  const verification = useTranslations('verification');
  const thanks = useTranslations('thanks.profile');
  const days = useTranslations('neighborhoodDays');
  const { helper } = data;
  const request = routes.app.requestHelper(helper.handle);
  const message = data.acceptsMessages ? routes.app.newMessage({ helper: helper.handle }) : null;
  // "Founding helper #63" on its own, unless their badges already say it.
  const foundingNumber = data.achievements?.some((badge) => badge.code === 'founding_helper') ? undefined : helper.foundingHelperNumber;
  const proof = helper.recommendedBy !== undefined || data.neighborsAnswers;

  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-8 lg:gap-y-10 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <header className="order-1 overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:col-start-1 lg:row-start-1">
        {/* A soft brand band; the photo sits across its lower edge. */}
        <div aria-hidden="true" className="h-20 bg-[linear-gradient(115deg,var(--color-brand-soft),var(--color-clay-soft)_55%,var(--color-violet-soft))] md:h-24" />
        <div className="space-y-5 px-card pb-card">
          <div className="space-y-3">
            {/* The photo overlaps the band; the name starts below its edge, never across it (audit M44). */}
            <span className="-mt-12 block w-fit rounded-full bg-card p-1 shadow-card">
              <InitialsAvatar initials={helper.initials} photo={helper.photo} size="xl" />
            </span>
            <div className="min-w-0 space-y-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="min-w-0 font-display text-2xl/8 font-semibold tracking-[-0.025em] break-words md:text-[28px]/9">{helper.displayName}</h1>
                {helper.badges.idVerifiedAt && <BadgeCheck role="img" aria-label={verification('identity')} className="size-6 shrink-0 text-primary" />}
              </div>
              {helper.headline && <p className="text-base leading-6 md:text-[17px]/7">{helper.headline}</p>}
              {/* No separators between the facts: a wrapped line would start or end with one. */}
              <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-sm text-muted-foreground">
                {data.username && <span className="break-all">@{data.username}</span>}
                <span className="inline-flex min-w-0 items-start gap-1.5"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{t('travelRadius', { miles: data.serviceRadiusMiles, area: helper.areaName })}</span></span>
                {data.remoteOk && <span className="inline-flex items-center gap-1.5"><Laptop aria-hidden="true" className="size-4 shrink-0" />{t('remoteOk')}</span>}
              </p>
            </div>
          </div>
          <ProfileStats data={data} now={now} />
          <VerificationBadges badges={helper.badges} variant="line" />
          {proof && <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm tabular-nums">
            {helper.recommendedBy !== undefined && <li className="inline-flex items-center gap-1.5"><ThumbsUp aria-hidden="true" className="size-4 text-primary" />{t('recommendedBy', { count: helper.recommendedBy })}</li>}
            {data.neighborsAnswers && <li className="inline-flex items-center gap-1.5"><MessagesSquare aria-hidden="true" className="size-4 text-primary" />{t('neighborsHelped', { count: data.neighborsAnswers.helpedCount })}</li>}
          </ul>}
          {(foundingNumber !== undefined || (data.achievements && data.achievements.length > 0)) && <div className="flex flex-wrap items-center gap-2">
            {foundingNumber !== undefined && <p className="w-fit rounded-full bg-badge-reward px-3 py-1 text-sm font-medium tabular-nums text-badge-reward-foreground">{t('foundingHelper', { number: foundingNumber })}</p>}
            {data.achievements && <AchievementBadgeList badges={data.achievements} />}
          </div>}
        </div>
      </header>

      {/* Beside the page from 1024 px, in view while it scrolls; on phones its parts take their places in the column. */}
      <div className="contents lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block lg:space-y-4 lg:self-start">
        <div className={cn('order-2 space-y-3', !(contact && onRevealContact) && 'max-lg:hidden')}>
          <div className="hidden gap-2 rounded-2xl border border-border bg-card p-4 shadow-card lg:grid">
            <Link href={request} className={cn(buttonVariants({ size: 'lg' }), 'h-auto min-h-11 w-full whitespace-normal py-2.5')}>{t('requestBooking', { name: helper.displayName })}</Link>
            {message && <Link href={message} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-auto min-h-11 w-full whitespace-normal py-2.5')}><MessageCircle aria-hidden="true" className="size-4" />{t('message', { name: helper.displayName })}</Link>}
          </div>
          {contact && onRevealContact && <HelperContactPanel helperId={helper.id} name={helper.displayName} access={contact} onReveal={onRevealContact} {...(initialContactReveal ? { initialReveal: initialContactReveal } : {})} />}
        </div>
        <div className="order-4"><ProfileDetails data={data} now={now} /></div>
      </div>

      <div className="order-3 min-w-0 divide-y divide-border lg:col-start-1 lg:row-start-2 [&>*]:py-8 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        <ProfileSection id="helper-services-heading" title={t('services')}>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{data.services.map((service) => <ServiceRow key={service.categorySlug} service={service} />)}</ul>
        </ProfileSection>
        {/* 4d's slot (2026-11-27): skills, "Work I enjoy" and "Work I don't do" (data.skills, data.likes, data.excludes), as a <ProfileSection>. */}

        {data.slots && data.slots.length > 0 && <AvailabilitySlotList slots={data.slots} handle={helper.handle} />}
        {data.neighborhoodDays && data.neighborhoodDays.length > 0 && <NeighborhoodDayList days={data.neighborhoodDays} title={days('title')} intro={days('intro')} headingId="profile-neighborhood-days" />}

        <ProfileSection id="helper-reviews-heading" title={t('reviews')} aside={helper.rating && <RatingStars rating={helper.rating} />}>
          {/* "What neighbors say" (2026-11-24): made with AI from the reviews below. */}
          {data.reviewSummary && <ReviewSummaryCard summary={data.reviewSummary} />}
          {helper.rating && data.reviews.length < helper.rating.count && <p className="text-sm tabular-nums text-muted-foreground">{t('recentReviews', { shown: data.reviews.length, total: helper.rating.count })}</p>}
          {data.reviews.length > 0
            ? <ul className="grid gap-4 md:grid-cols-2">{data.reviews.map((review) => <li key={review.id} className="min-w-0"><ReviewCard review={review} reportHref={routes.app.report('review', review.id)} /></li>)}</ul>
            : <p className="flex items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"><Star aria-hidden="true" className="size-4 shrink-0" />{t('noReviews')}</p>}
        </ProfileSection>
        {/* Thank-you notes the helper chose to show (2026-11-24), apart from the reviews and the rating. */}
        {data.thanks && data.thanks.length > 0 && <ProfileSection id="helper-thanks-heading" title={thanks('title')}>
          <PublicThankYouNotes notes={data.thanks} />
        </ProfileSection>}

        {data.bio && <ProfileSection id="helper-about-heading" title={t('about', { name: helper.displayName })}>
          <ExpandableText text={data.bio} lines={5} className="max-w-reading leading-7" />
        </ProfileSection>}
        {/* 4d's slot (2026-11-27): experience (data.experience), as a <ProfileSection>. */}

        {data.workSamples.length > 0 && <ProfileSection id="helper-work-heading" title={t('workSamples')}>
          <WorkSampleGallery samples={data.workSamples} />
        </ProfileSection>}
        {data.neighborsAnswers && <NeighborsAnswers answers={data.neighborsAnswers} headingId="helper-answers-heading" />}
      </div>

      <div className="order-5 sticky bottom-3 z-20 flex gap-2 lg:hidden">
        <Link href={request} className={cn(buttonVariants({ size: 'lg' }), 'h-auto min-h-12 min-w-0 flex-1 whitespace-normal py-2.5 shadow-[0_10px_30px_-10px_var(--primary-glow)]')}>{t('requestBooking', { name: helper.displayName })}</Link>
        {message && <Link href={message} aria-label={t('message', { name: helper.displayName })} title={t('message', { name: helper.displayName })} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-auto min-h-12 shrink-0 bg-card px-4 shadow-card')}><MessageCircle aria-hidden="true" className="size-5" /></Link>}
      </div>
    </div>
  );
}
