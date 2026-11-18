import { ArrowRight, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityHelperCard } from '@/contracts';
import { routes } from '@/contracts/routes';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { LocaleLink as Link } from '@/ui/lib/locale-link';

/**
 * A helper named in an answer or thanked in a post (completion plan 7.8): a small card that opens their profile,
 * with their rating and how many neighbors who booked them recommend them, and Request to book them straight from
 * the thread (9.10). A helper naming themself says so.
 */
export function HelperRecommendation({ helper, label }: { helper: CommunityHelperCard; label: 'recommended' | 'thanked' }) {
  const t = useTranslations('community.helperCard');
  // On phones the actions take their own line under the helper, so the name and the neighbors' word keep the width.
  return <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-background/60 p-3">
    <InitialsAvatar initials={helper.initials} size="sm" />
    <div className="min-w-0 flex-1 leading-tight">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{helper.selfTag ? t('selfTag') : t(label)}</p>
      <p className="truncate text-sm font-semibold">{helper.displayName}</p>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {helper.rating && <span className="inline-flex items-center gap-0.5 font-medium text-foreground tabular-nums"><Star aria-hidden="true" className="size-3 fill-current text-sun" />{helper.rating.average.toFixed(1)} ({helper.rating.count})</span>}
        <span>{t('recommendedBy', { count: helper.recommendedBy })}</span>
      </p>
    </div>
    <div className="flex w-full items-center justify-end gap-1 border-t border-border/70 pt-2 sm:w-auto sm:shrink-0 sm:border-0 sm:pt-0">
      {/* Bookable from the thread (plan 9.10): the request page, for anyone but the helper. */}
      {helper.requestHref && <Link href={helper.requestHref} aria-label={t('requestLabel', { name: helper.displayName })} className="inline-flex min-h-9 items-center rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t('request')}</Link>}
      <Link href={routes.helperProfile(helper.handle)} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-primary hover:bg-primary/[0.06] focus-visible:outline-2 focus-visible:outline-ring">
        {t('view')}<ArrowRight aria-hidden="true" className="size-3.5" /><span className="sr-only">: {helper.displayName}</span>
      </Link>
    </div>
  </div>;
}
