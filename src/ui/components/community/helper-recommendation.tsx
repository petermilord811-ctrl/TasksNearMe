import { ArrowRight, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityHelperCard } from '@/contracts';
import { routes } from '@/contracts/routes';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { LocaleLink as Link } from '@/ui/lib/locale-link';

/**
 * A helper named in an answer or thanked in a post (completion plan 7.8): a small card that opens their profile,
 * with their rating and how many neighbors who booked them recommend them, and Request to book them straight from
 * the thread (9.10). A helper naming themself says so. `compact`: one line under a reply shown in the feed (the card
 * and its buttons are on the post's page), so a preview stays a preview.
 */
export function HelperRecommendation({ helper, label, compact = false }: { helper: CommunityHelperCard; label: 'recommended' | 'thanked'; compact?: boolean }) {
  const t = useTranslations('community.helperCard');
  const rating = helper.rating && <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground tabular-nums"><Star aria-hidden="true" className="size-3 fill-current text-sun" />{helper.rating.average.toFixed(1)} ({helper.rating.count})</span>;
  if (compact) {
    return <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="shrink-0">{helper.selfTag ? t('selfTag') : t(label)}:</span>
      <Link href={routes.helperProfile(helper.handle)} className="min-w-0 truncate rounded-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{helper.displayName}</Link>
      {rating}
    </p>;
  }
  return <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl border border-border bg-background/60 px-2.5 py-2">
    <InitialsAvatar initials={helper.initials} size="sm" />
    {/* At least 10rem for the name and rating, so on a phone Request and View profile wrap under them, not over them. */}
    <div className="min-w-0 grow basis-40 leading-tight">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{helper.selfTag ? t('selfTag') : t(label)}</p>
      <p className="truncate text-[13.5px] font-semibold">{helper.displayName}</p>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {rating}
        <span>{t('recommendedBy', { count: helper.recommendedBy })}</span>
      </p>
    </div>
    <div className="ml-auto flex shrink-0 items-center gap-0.5">
      {/* Bookable from the thread (plan 9.10): the request page, for anyone but the helper. */}
      {helper.requestHref && <Link href={helper.requestHref} aria-label={t('requestLabel', { name: helper.displayName })} className="inline-flex min-h-8 items-center rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t('request')}</Link>}
      <Link href={routes.helperProfile(helper.handle)} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-primary hover:bg-primary/[0.06] focus-visible:outline-2 focus-visible:outline-ring">
        {t('view')}<ArrowRight aria-hidden="true" className="size-3.5" /><span className="sr-only">: {helper.displayName}</span>
      </Link>
    </div>
  </div>;
}
