import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityAuthor, ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { cn } from '@/ui/lib/utils';

const roleTone: Record<CommunityAuthor['role'], string> = {
  helper: 'bg-badge-brand text-badge-brand-foreground',
  poster: 'bg-badge-info text-badge-info-foreground',
  neighbor: 'bg-badge-neutral text-badge-neutral-foreground',
};

/**
 * Who wrote a post or a reply: their avatar, name, a role label earned by what they do here (helper, poster,
 * neighbor), an ID check, their neighborhood when they help there, and how long ago (completion plan 7.7).
 */
export function AuthorLine({ author, at, now, size = 'md' }: { author: CommunityAuthor; at: ISODateTime; now: ISODateTime; size?: 'sm' | 'md' }) {
  const t = useTranslations('community');
  const { formatRelative, formatDateTime } = useFormat();
  return <div className="flex min-w-0 items-center gap-2.5">
    <InitialsAvatar initials={author.initials} size="sm" />
    <div className="min-w-0 leading-tight">
      <p className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-semibold', size === 'sm' ? 'text-[13px]' : 'text-sm')}>
        <span className="truncate">{author.displayName}{author.isYou && <span className="font-normal text-muted-foreground"> ({t('you')})</span>}</span>
        {author.verified && <BadgeCheck aria-label={t('verified')} role="img" className="size-3.5 shrink-0 text-primary" />}
        <span className={cn('rounded-full px-1.5 py-px text-[11px] font-semibold', roleTone[author.role])}>{t(`roles.${author.role}`)}</span>
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {author.areaName && <>{author.areaName} · </>}
        <time dateTime={at} title={formatDateTime(at)}>{formatRelative(at, now)}</time>
      </p>
    </div>
  </div>;
}
