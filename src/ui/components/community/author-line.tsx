'use client';

import { useState, type ReactNode } from 'react';
import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityAuthor, ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { AuthorCardContent, roleTone } from './author-card';

/**
 * Who wrote a post or a reply: their avatar, name and ID check on the first line; a role label earned by what they
 * do here (helper, poster, neighbor), their neighborhood when they help there, and how long ago on the second
 * (completion plan 7.7), so a name never has to share its line with badges. The name opens the card behind it
 * (plan 9.10, LinkedIn-style); a tap on the avatar opens the same card. `href`: the time links to the post (its
 * permalink, as on Nextdoor), which is how a general post without a title opens. `xs`: one line (name and time) for a
 * reply shown under a card in the feed.
 */
export function AuthorLine({ author, at, now, size = 'md', edited, href }: {
  author: CommunityAuthor;
  at: ISODateTime;
  now: ISODateTime;
  size?: 'xs' | 'sm' | 'md';
  /** Edited since (plan 10.5): "Edited" after the time. */
  edited?: ISODateTime;
  /** The post's page: the time links there. */
  href?: string;
}) {
  const t = useTranslations('community');
  const { formatRelative, formatDateTime } = useFormat();
  const [open, setOpen] = useState(false);
  const name = <>{author.displayName}{author.isYou && <span className="font-normal text-muted-foreground"> ({t('you')})</span>}</>;
  const time = <time dateTime={at} title={formatDateTime(at)}>{formatRelative(at, now)}</time>;
  const when = href
    ? <Link href={href} className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">{time}</Link>
    : time;
  const line = (nameNode: ReactNode, avatar: ReactNode) => size === 'xs'
    ? <div className="flex min-w-0 items-center gap-1.5 text-xs leading-tight">
        {avatar}
        <span className="flex min-w-0 items-center gap-1 font-semibold">{nameNode}{author.verified && <BadgeCheck aria-label={t('verified')} role="img" className="size-3 shrink-0 text-primary" />}</span>
        <span className="shrink-0 text-muted-foreground">· {when}{edited && <> · <span title={formatDateTime(edited)}>{t('edited')}</span></>}</span>
      </div>
    : <div className="flex min-w-0 items-center gap-2">
        {avatar}
        <div className="min-w-0 leading-tight">
          <p className={cn('flex min-w-0 items-center gap-1 font-semibold', size === 'sm' ? 'text-[13px]' : 'text-[13.5px]')}>
            {nameNode}
            {author.verified && <BadgeCheck aria-label={t('verified')} role="img" className="size-3.5 shrink-0 text-primary" />}
          </p>
          <p className="mt-px flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className={cn('shrink-0 rounded-full px-1.5 text-[10.5px] leading-4 font-semibold', roleTone[author.role])}>{t(`roles.${author.role}`)}</span>
            <span className="truncate">
              {author.areaName && <>{author.areaName} · </>}
              {when}
              {edited && <> · <span title={formatDateTime(edited)}>{t('edited')}</span></>}
            </span>
          </p>
        </div>
      </div>;
  const avatar = <InitialsAvatar initials={author.initials} photo={author.photo} size={size === 'xs' ? 'xs' : 'sm'} />;
  if (!author.card) return line(<span className="truncate">{name}</span>, avatar);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverAnchor asChild>
      {line(
        <PopoverTrigger className="min-w-0 truncate rounded-sm text-left underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{name}</PopoverTrigger>,
        // The avatar opens the same card for a mouse or a finger; the name is the control for everyone else.
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(true)} className="shrink-0 rounded-full transition-transform duration-150 motion-safe:hover:scale-105">{avatar}</button>,
      )}
    </PopoverAnchor>
    <PopoverContent align="start" className="w-80 p-4"><AuthorCardContent author={author} now={now} /></PopoverContent>
  </Popover>;
}
