'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityPostHandlers, CommunityPostPageData, ISODateTime } from '@/contracts';
import { routes } from '@/contracts/routes';
import { CommunityItemActions } from './item-actions';
import { ReplyItem } from './post-card';

/** Replies a thread shows before "Show N more" (the pinned answer first, then the conversation in order). */
export const THREAD_FOLD = 10;

/**
 * A post's replies (completion plan 7.7, folded in 9.10): the pinned answer first, then the conversation in order;
 * a long thread shows its first ten and "Show 20 more replies", so the reply box stays near. Every reply keeps its
 * actions (pin for the author, report, staff moderation) and "New" since the last visit. The folded replies stay
 * in the page (hidden), so a link to one still finds it once opened.
 */
export function ThreadReplies({ data, handlers, now, visitKey }: { data: CommunityPostPageData; handlers: CommunityPostHandlers; now: ISODateTime; visitKey: string }) {
  const t = useTranslations('community.thread');
  const [open, setOpen] = useState(false);
  const { viewer } = data;
  const folded = data.replies.length - THREAD_FOLD;
  return <>
    <ol className="space-y-4">
      {data.replies.map((reply, index) => <li key={reply.id} hidden={!open && index >= THREAD_FOLD} className="border-b border-border/70 pb-4 last:border-b-0">
        <ReplyItem reply={reply} now={now} onReact={handlers.onReact} visitKey={visitKey} actions={<CommunityItemActions
          target="reply"
          id={reply.id}
          label={reply.author.displayName}
          own={reply.author.isYou}
          onDelete={handlers.onDelete}
          {...(viewer.canPin && !reply.moderation ? { pin: { pinned: reply.pinned, onPin: handlers.onPin } } : {})}
          {...(!reply.author.isYou ? { reportHref: routes.app.report('reply', reply.id) } : {})}
          {...(viewer.isStaff && handlers.onModerate ? { onModerate: handlers.onModerate, hidden: Boolean(reply.moderation) } : {})}
        />} />
      </li>)}
    </ol>
    {folded > 0 && <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring">
      {open ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}
      {open ? t('showLess') : t('showMore', { count: folded })}
    </button>}
  </>;
}
