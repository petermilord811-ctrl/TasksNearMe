import { eq } from 'drizzle-orm';
import type { CommunityTranslation } from '@/contracts';
import { createTranslator, type Translator } from '@/integrations/ai/translator';
import type { Db } from '@/platform/db/connect';
import { consumeRateLimit } from '@/platform/rate-limit';
import { communityReplies } from './schema';
import { readablePost, type CommunityViewer } from './service';

/** Translations per person per day (each one is a model call on a free allowance). */
export const TRANSLATE_RULE = { limit: 60, windowSeconds: 24 * 60 * 60 };

/** Whether "See translation" is offered here (a model, or the stand-in outside production). */
export function translationOffered(env: Record<string, string | undefined> = process.env): boolean {
  return createTranslator(env) !== null;
}

/**
 * A post or reply the viewer can read, in their language (plan 10.23): made on request and never stored. `null` when
 * translations aren't offered, the item isn't readable, the day's allowance is used, or no model answered.
 */
export async function translateCommunityItem(db: Db, viewer: CommunityViewer, target: { target: 'post' | 'reply'; id: string }, now: Date, translator: Translator | null = createTranslator()): Promise<CommunityTranslation | null> {
  if (!translator) return null;
  let postId = target.id;
  let replyBody: string | undefined;
  let replyAuthor: string | undefined;
  if (target.target === 'reply') {
    const [reply] = await db.select({ postId: communityReplies.postId, body: communityReplies.body, status: communityReplies.status, authorUserId: communityReplies.authorUserId }).from(communityReplies).where(eq(communityReplies.id, target.id)).limit(1);
    if (!reply || reply.status !== 'visible') return null;
    postId = reply.postId;
    replyBody = reply.body;
    replyAuthor = reply.authorUserId;
  }
  const readable = await readablePost(db, viewer, postId);
  if (!readable) return null;
  const { post } = readable;
  if (target.target === 'reply' && replyAuthor && readable.blocked.includes(replyAuthor)) return null;
  const limited = await consumeRateLimit(db, `community:translate:${viewer.id}`, TRANSLATE_RULE, now);
  if (!limited.ok) return null;
  try {
    const to = viewer.locale ?? 'en';
    return target.target === 'reply' ? await translator.translate({ body: replyBody ?? '', to }) : await translator.translate({ title: post.title, body: post.body, to });
  } catch {
    return null;
  }
}
