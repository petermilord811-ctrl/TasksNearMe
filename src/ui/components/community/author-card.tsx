'use client';

import { ArrowRight, BadgeCheck, MapPin, MessageCircle, MessageCircleReply, Star, ThumbsUp, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityAuthor } from '@/contracts';
import { routes } from '@/contracts/routes';
import { AchievementBadge } from '@/ui/components/people/achievement-badges';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { SparksBadge } from '@/ui/components/people/sparks-badge';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';

export const roleTone: Record<CommunityAuthor['role'], string> = {
  helper: 'bg-badge-brand text-badge-brand-foreground',
  poster: 'bg-badge-info text-badge-info-foreground',
  neighbor: 'bg-badge-neutral text-badge-neutral-foreground',
};

/**
 * The card behind an author's name (completion plan 9.10, LinkedIn-style): who they are here, from what they've
 * done, never from a claim. Everyone: their role, the ID check, their neighborhood and when they joined. Helpers:
 * their rating, tasks done, how many neighbors recommend them, how fast they reply, their top badges, and their
 * profile and Request.
 */
export function AuthorCardContent({ author }: { author: CommunityAuthor }) {
  const t = useTranslations('community');
  const helperCopy = useTranslations('helperCard');
  const { formatMonthYear } = useFormat();
  const card = author.card;
  if (!card) return null;
  const helper = card.helper;
  return <div className="space-y-3.5">
    <div className="flex items-start gap-3">
      <InitialsAvatar initials={author.initials} photo={author.photo} size="lg" />
      <div className="min-w-0 space-y-1 pt-0.5">
        <p className="flex flex-wrap items-center gap-1.5 font-display text-lg leading-tight font-semibold">
          <span className="[overflow-wrap:anywhere]">{author.displayName}</span>
          {author.verified && <BadgeCheck aria-label={t('verified')} role="img" className="size-4 shrink-0 text-primary" />}
        </p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className={cn('rounded-full px-1.5 py-px font-semibold', roleTone[author.role])}>{t(`roles.${author.role}`)}</span>
          <span className="text-muted-foreground">{t(`authorCard.roleHint.${author.role}`)}</span>
        </p>
      </div>
    </div>
    {helper?.headline && <p className="text-sm [overflow-wrap:anywhere]">{helper.headline}</p>}
    <ul className="space-y-1.5 text-[13px] text-muted-foreground">
      {author.areaName && <li className="flex items-center gap-2"><MapPin aria-hidden="true" className="size-3.5 shrink-0" />{author.areaName}</li>}
      {helper?.rating && <li className="flex items-center gap-2 tabular-nums"><Star aria-hidden="true" className="size-3.5 shrink-0 fill-current text-sun" /><span className="font-medium text-foreground">{t('authorCard.rating', { average: helper.rating.average.toFixed(1), count: helper.rating.count })}</span></li>}
      {helper && <li className="flex items-center gap-2 tabular-nums"><Wrench aria-hidden="true" className="size-3.5 shrink-0" />{t('authorCard.tasksDone', { count: helper.completedCount })}</li>}
      {helper && <li className="flex items-center gap-2 tabular-nums"><ThumbsUp aria-hidden="true" className="size-3.5 shrink-0" />{t('authorCard.recommendedBy', { count: helper.recommendedBy })}</li>}
      {helper?.responseTime && <li className="flex items-center gap-2"><MessageCircleReply aria-hidden="true" className="size-3.5 shrink-0" />{helperCopy('responseTime', { range: helper.responseTime })}</li>}
      <li className="tabular-nums">{t('authorCard.memberSince', { date: formatMonthYear(card.memberSince) })}</li>
    </ul>
    {card.sparks && <SparksBadge sparks={card.sparks} compact />}
    {helper && helper.badges.length > 0 && <div className="space-y-1.5">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t('authorCard.badges')}</p>
      <ul className="flex flex-wrap gap-1.5">{helper.badges.map((badge) => <li key={`${badge.code}:${badge.category ?? ''}`} className="max-w-full"><AchievementBadge badge={badge} compact /></li>)}</ul>
    </div>}
    {(author.helperHandle || card.messageHref) && <div className="flex flex-wrap gap-2 border-t border-border pt-3">
      {helper?.requestHref && <Link href={helper.requestHref} className={buttonVariants({ size: 'sm', className: 'min-h-10' })}>{t('authorCard.request')}</Link>}
      {card.messageHref && <Link href={card.messageHref} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'min-h-10' })}><MessageCircle aria-hidden="true" className="size-3.5" />{t('authorCard.message')}</Link>}
      {author.helperHandle && <Link href={routes.helperProfile(author.helperHandle)} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'min-h-10' })}>{t('authorCard.viewProfile')}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>}
    </div>}
  </div>;
}
