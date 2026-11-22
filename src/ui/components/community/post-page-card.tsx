'use client';

import type { ReactNode } from 'react';
import type { CommunityPostHandlers, CommunityPostView, ISODateTime } from '@/contracts';
import { PostCard } from './post-card';
import { REPLY_FORM_ID } from './reply-target';
import { TranslateButton } from './translate-button';

/**
 * The post at the top of its page (plan 10): the card, with Reply moving to the thread's reply form, and "See
 * translation" under its words where it's offered.
 */
export function PostPageCard({ post, now, handlers, actions, canReply }: { post: CommunityPostView; now: ISODateTime; handlers: CommunityPostHandlers; actions: ReactNode; canReply: boolean }) {
  const focusForm = () => {
    const form = document.getElementById(REPLY_FORM_ID);
    form?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    form?.querySelector('textarea')?.focus({ preventScroll: true });
  };
  return <PostCard
    post={post}
    now={now}
    onReact={handlers.onReact}
    mode="page"
    actions={actions}
    {...(handlers.onSavePost ? { onSavePost: handlers.onSavePost } : {})}
    {...(handlers.onLoadReactors ? { onLoadReactors: handlers.onLoadReactors } : {})}
    {...(canReply ? { onReplyClick: focusForm } : {})}
    {...(handlers.onTranslate && !post.moderation ? { bodyFooter: <TranslateButton target={{ target: 'post', id: post.id }} onTranslate={handlers.onTranslate} /> } : {})}
  />;
}
