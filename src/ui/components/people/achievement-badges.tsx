import { CalendarClock, CheckCheck, ChevronRight, Clock, Gem, House, Medal, Repeat, Smile, Star, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BadgeCode, BadgeProgressView, BadgeView, OwnBadgesData } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

/**
 * Achievement badges (completion plan 6.4), like GitHub's: a pill with the badge's icon, its name and what
 * the tier took ("Tasks done · 25 tasks"). Everything arrives counted; the UI only words it.
 */

const ICONS: Record<BadgeCode, LucideIcon> = {
  tasks_completed: CheckCheck,
  five_star: Star,
  on_time: Clock,
  repeat_clients: Repeat,
  category_pro: Medal,
  regular_visits: CalendarClock,
  founding_helper: Gem,
  client_bookings: House,
  client_regular: CalendarClock,
  client_five_star: Smile,
};

/** The badge's name and what its tier took, in the page's language. */
export function useBadgeWords() {
  const t = useTranslations('badges');
  const categories = useTranslations('taskCard.categories');
  const name = (badge: Pick<BadgeView, 'code' | 'category'>) =>
    badge.code === 'category_pro' && badge.category ? t('categoryPro', { category: categories(badge.category) }) : t(`names.${badge.code}`);
  const detail = (badge: Pick<BadgeView, 'code' | 'threshold' | 'foundingNumber'>) =>
    badge.code === 'founding_helper' ? (badge.foundingNumber ? t('details.founding_helper', { number: badge.foundingNumber }) : '') : t(`details.${badge.code}`, { threshold: badge.threshold });
  return { name, detail };
}

export function AchievementBadge({ badge, compact = false }: { badge: BadgeView; compact?: boolean }) {
  const t = useTranslations('badges');
  const { formatDate } = useFormat();
  const { name, detail } = useBadgeWords();
  const Icon = ICONS[badge.code];
  const words = detail(badge);
  const top = badge.tier === badge.tierCount && badge.tierCount > 1;
  return <span
    title={`${t('tier', { tier: badge.tier, count: badge.tierCount })} · ${t('earnedOn', { date: formatDate(badge.earnedAt, { withYear: true }) })}`}
    className={cn(
      'inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium',
      compact ? 'px-2.5 py-0.5 text-xs leading-5' : 'px-3 py-1 text-sm leading-5',
      top || badge.code === 'founding_helper' ? 'border-transparent bg-badge-reward text-badge-reward-foreground' : 'border-violet/25 bg-violet-soft text-foreground',
    )}
  >
    <Icon aria-hidden="true" className={cn('shrink-0', compact ? 'size-3.5' : 'size-4')} />
    <span className="min-w-0 break-words">{name(badge)}{!compact && words && <span className="font-normal"> · {words}</span>}</span>
  </span>;
}

/** Every badge a helper shows (the public profile). */
export function AchievementBadgeList({ badges, label }: { badges: BadgeView[]; label?: string }) {
  const t = useTranslations('badges');
  if (badges.length === 0) return null;
  return <ul aria-label={label ?? t('listLabel')} className="flex flex-wrap gap-2">
    {badges.map((badge) => <li key={`${badge.code}:${badge.category ?? ''}`} className="max-w-full"><AchievementBadge badge={badge} /></li>)}
  </ul>;
}

/** Up to three, small, for helper cards. */
export function TopBadges({ badges }: { badges?: BadgeView[] }) {
  const t = useTranslations('badges');
  if (!badges || badges.length === 0) return null;
  return <ul aria-label={t('listLabel')} className="flex flex-wrap gap-1.5">
    {badges.slice(0, 3).map((badge) => <li key={`${badge.code}:${badge.category ?? ''}`} className="max-w-full"><AchievementBadge badge={badge} compact /></li>)}
  </ul>;
}

function Progress({ count, threshold, label }: { count: number; threshold: number; label: string }) {
  const value = Math.min(count, threshold);
  return <div className="space-y-1">
    <div role="progressbar" aria-valuemin={0} aria-valuemax={threshold} aria-valuenow={value} aria-label={label} className="h-1.5 rounded-full bg-foreground/[0.07] dark:bg-white/[0.08]">
      <div className="h-1.5 rounded-full bg-violet" style={{ width: `${(100 * value) / Math.max(1, threshold)}%` }} />
    </div>
    <p className="text-xs text-muted-foreground tabular-nums">{label}</p>
  </div>;
}

/** The account page: what's earned, the way to each next level, and the closest badges not earned yet. */
export function OwnBadgesPanel({ data }: { data: OwnBadgesData }) {
  const t = useTranslations('badges');
  const { name, detail } = useBadgeWords();
  return <div className="space-y-5">
    {data.earned.length === 0 ? <p className="text-muted-foreground">{t('none')}</p> : <ul className="space-y-3">
      {data.earned.map((badge) => <li key={`${badge.code}:${badge.category ?? ''}`} className="space-y-2">
        <AchievementBadge badge={badge} />
        {badge.next && <Progress count={badge.next.count} threshold={badge.next.threshold} label={t('next', { count: badge.next.count, threshold: badge.next.threshold })} />}
      </li>)}
    </ul>}
    {/* What's next and how badges count, one tap away: the account page is long enough (plan 9.14, audit M37). */}
    <details className="group/more border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform duration-200 group-open/more:rotate-90 motion-reduce:transition-none" />{t(data.upNext.length > 0 ? 'moreWithNext' : 'moreHowCounted')}
      </summary>
      <div className="space-y-4 pt-2">
        {data.upNext.length > 0 && <section aria-labelledby="badges-up-next" className="space-y-3">
          <h4 id="badges-up-next" className="font-semibold">{t('upNextTitle')}</h4>
          <ul className="space-y-3">{data.upNext.map((item: BadgeProgressView) => <li key={`${item.code}:${item.category ?? ''}`} className="space-y-1.5">
            <p className="text-sm font-medium">{name(item)} <span className="font-normal text-muted-foreground">· {detail({ code: item.code, threshold: item.threshold })}</span></p>
            <Progress count={item.count} threshold={item.threshold} label={t('progress', { count: item.count, threshold: item.threshold })} />
          </li>)}</ul>
        </section>}
        <p className="text-sm text-muted-foreground">{t('howCounted')}</p>
      </div>
    </details>
  </div>;
}
