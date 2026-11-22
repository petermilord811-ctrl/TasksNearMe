'use client';

import { useState, type ReactNode } from 'react';
import type { ActionHandler, ActionResult, CommunityPostView, CommunityReactInput, CommunityReactorsView, CommunityReplyInput, Photo, QueryHandler } from '@/contracts';
import { routes } from '@/contracts/routes';
import { InlineReply } from './inline-reply';
import { PostEngagement } from './post-engagement';
import { SaveButton } from './save-button';

/**
 * The bottom of a post's card (plan 10.2, 10.3): what neighbors did and the actions, then in the feed its pinned or
 * latest replies and, after Reply, a reply box right there. Reply on a post's page moves to its form instead.
 */
export function PostCardFooter({ post, mode, onReact, onSavePost, onReplyInline, me, onLoadReactors, onReplyClick, askForHelp, previews }: {
  post: CommunityPostView;
  mode: 'feed' | 'page';
  onReact: ActionHandler<CommunityReactInput>;
  onSavePost?: ActionHandler<{ postId: string; saved: boolean }>;
  onReplyInline?: (postId: string, input: CommunityReplyInput) => Promise<ActionResult>;
  me?: { initials: string; photo?: Photo };
  onLoadReactors?: QueryHandler<{ target: 'post' | 'reply'; id: string }, CommunityReactorsView | null>;
  onReplyClick?: () => void;
  askForHelp?: ReactNode;
  previews?: ReactNode;
}) {
  const [replying, setReplying] = useState(false);
  const canReplyHere = mode === 'feed' && Boolean(onReplyInline) && post.canReply === true;
  const onReply = canReplyHere ? () => setReplying((open) => !open) : mode === 'page' ? onReplyClick : undefined;
  return <>
    <PostEngagement
      target={{ kind: 'post', id: post.id }}
      reactions={post.reactions}
      own={post.author.isYou}
      onReact={onReact}
      {...(post.helpfulNames ? { helpfulNames: post.helpfulNames } : {})}
      {...(onLoadReactors ? { onLoadReactors } : {})}
      replies={{ count: post.replyCount, ...(mode === 'feed' ? { href: routes.app.communityPost(post.id) } : {}) }}
      {...(onReply ? { onReply } : {})}
      {...(canReplyHere ? { replyExpanded: replying } : {})}
      trailing={askForHelp}
    >
      {onSavePost && !post.moderation && <SaveButton id={post.id} title={post.title} saved={post.saved ?? false} target={{ kind: 'post', onSave: onSavePost }} compact="phone" />}
    </PostEngagement>
    {previews}
    {canReplyHere && replying && onReplyInline && <InlineReply postId={post.id} onReply={onReplyInline} {...(me ? { me } : {})} autoFocus onDone={() => setReplying(false)} />}
  </>;
}
