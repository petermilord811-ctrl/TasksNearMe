'use client';

import type { ReactNode } from 'react';
import type { CommunityPostHandlers, CommunityPostView, ISODateTime } from '@/contracts';
import { PostCard } from './post-card';
import { useFocusReplyForm } from './reply-target';
import { TranslateButton } from './translate-button';

/**
 * The post at the top of its page (plan 10): the card, with Reply moving to the thread's reply form, and "See
 * translation" under its words where it's offered.
 */
export function PostPageCard({ post, now, handlers, actions, canReply, headingLevel = 1 }: { post: CommunityPostView; now: ISODateTime; handlers: CommunityPostHandlers; actions: ReactNode; canReply: boolean; /** 2 in the post's dialog, under the dialog's own title. */ headingLevel?: 1 | 2 }) {
  const focusForm = useFocusReplyForm();
  return <PostCard
    post={post}
    now={now}
    onReact={handlers.onReact}
    mode="page"
    headingLevel={headingLevel}
    actions={actions}
    {...(handlers.onSavePost ? { onSavePost: handlers.onSavePost } : {})}
    {...(handlers.onLoadReactors ? { onLoadReactors: handlers.onLoadReactors } : {})}
    {...(canReply ? { onReplyClick: focusForm } : {})}
    {...(handlers.onTranslate && !post.moderation ? { bodyFooter: <TranslateButton target={{ target: 'post', id: post.id }} onTranslate={handlers.onTranslate} /> } : {})}
  />;
}
