import { and, eq } from 'drizzle-orm';
import {
  CATEGORY_SLUGS,
  communityAnswerDraftInputSchema,
  communityPolishInputSchema,
  type AiAssistResult,
  type AppLocale,
  type CategorySlug,
  type CommunityAnswerDraft,
  type CommunityPolish,
  type CommunityPostKind,
  type CommunityPostPageData,
} from '@/contracts';
import type { NeighborsWriter } from '@/integrations/ai/neighbors-writer';
import { users } from '@/modules/accounts/schema';
import { readablePost, type CommunityViewer } from '@/modules/community/service';
import { categories } from '@/modules/markets/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { findProhibitedPhrase, maskContactDetails } from '@/modules/trust/contact-masking';
import { GLOBAL_PROHIBITED_PHRASES } from '@/modules/trust/prohibited';
import type { Db } from '@/platform/db/connect';
import { aiDraftingEnabledFor, aiDraftingFlag } from './availability';
import { asAiResult, invalidInput, NOT_FOUND, overLimit, prohibitedOn, UNAVAILABLE } from './ai-run';

/**
 * AI on Neighbors (2026-11-24; src/contracts/ai-assist.ts): "Make it clearer" in the composer, and "Draft an answer"
 * for a helper on a question or recommendation request in a service they offer. The post and the helper's profile
 * come from the database, as the helper may read them; the drafts go back into the form. Nothing is posted.
 */

/** Rewrites and answer drafts per person an hour. */
export const POLISH_RULE = { limit: 20, windowSeconds: 60 * 60 };
export const ANSWER_RULE = { limit: 20, windowSeconds: 60 * 60 };
/** Posts an answer draft is offered on. */
const ANSWERABLE: readonly CommunityPostKind[] = ['question', 'recommendation'];

const clean = (text: string) => maskContactDetails(text).text;
const isCategory = (slug: string | null | undefined): slug is CategorySlug => Boolean(slug && (CATEGORY_SLUGS as readonly string[]).includes(slug));

export async function polishCommunityPost(
  { db, writer, now }: { db: Db; writer: NeighborsWriter | null; now: Date },
  userId: string,
  input: unknown,
  locale: AppLocale,
): Promise<AiAssistResult<CommunityPolish>> {
  if (!writer || !(await aiDraftingFlag(db, userId))) return UNAVAILABLE;
  const parsed = communityPolishInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { kind, body, categorySlug } = parsed.data;
  const title = kind === 'general' ? undefined : (parsed.data.title ?? '');
  if (`${title ?? ''} ${body}`.trim().length < 5) return { ok: false, code: 'validation_failed', fieldErrors: { body: ['too_short'] } };
  if (findProhibitedPhrase(`${title ?? ''}\n${body}`, GLOBAL_PROHIBITED_PHRASES)) return prohibitedOn('body');
  const limited = await overLimit(db, `assist:polish:${userId}`, POLISH_RULE, now);
  if (limited) return limited;
  return asAiResult('assist-polish', 'body', async () => {
    const polished = await writer.polish({ kind, ...(title !== undefined ? { title: clean(title) } : {}), body: clean(body), ...(categorySlug ? { categorySlug } : {}), locale });
    return { ...(polished.title !== undefined ? { title: clean(polished.title) } : {}), body: clean(polished.body) };
  });
}

/** The services a helper offers now (an active profile and active services). */
async function activeServicesOf(db: Db, userId: string): Promise<CategorySlug[]> {
  const rows = await db
    .select({ slug: categories.slug })
    .from(helperServices)
    .innerJoin(categories, eq(categories.id, helperServices.categoryId))
    .innerJoin(helperProfiles, eq(helperProfiles.userId, helperServices.userId))
    .where(and(eq(helperServices.userId, userId), eq(helperServices.status, 'active'), eq(helperProfiles.status, 'active')));
  return rows.map((row) => row.slug).filter(isCategory);
}

/** Whether a post is one this person could answer with a draft: an ask in a service they offer, not their own. */
function answerable(post: { kind: string; categorySlug: string | null; authorUserId: string }, userId: string, services: readonly CategorySlug[]): boolean {
  return (ANSWERABLE as readonly string[]).includes(post.kind) && isCategory(post.categorySlug) && services.includes(post.categorySlug) && post.authorUserId !== userId;
}

/**
 * The post page with "Draft an answer with AI" for this viewer, when it applies: they can reply, the post asks in a
 * service they offer, and AI is on for them.
 */
export async function withAnswerDraft(db: Db, userId: string, data: CommunityPostPageData): Promise<CommunityPostPageData> {
  const { post, viewer } = data;
  if (!viewer.canReply || viewer.isAuthor || !(ANSWERABLE as readonly string[]).includes(post.kind) || !isCategory(post.categorySlug)) return data;
  if (!(await activeServicesOf(db, userId)).includes(post.categorySlug) || !(await aiDraftingEnabledFor(db, userId))) return data;
  return { ...data, viewer: { ...viewer, answerDraft: true } };
}

export async function draftCommunityAnswer(
  { db, writer, now }: { db: Db; writer: NeighborsWriter | null; now: Date },
  viewer: CommunityViewer,
  postId: string,
  input: unknown,
  locale: AppLocale,
): Promise<AiAssistResult<CommunityAnswerDraft>> {
  if (!writer || !(await aiDraftingFlag(db, viewer.id))) return UNAVAILABLE;
  const parsed = communityAnswerDraftInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const readable = await readablePost(db, viewer, String(postId));
  if (!readable) return NOT_FOUND;
  const { post } = readable;
  const services = await activeServicesOf(db, viewer.id);
  if (!answerable(post, viewer.id, services) || !isCategory(post.categorySlug)) return { ok: false, code: 'not_allowed' };
  const notes = parsed.data.notes;
  if (findProhibitedPhrase(notes, GLOBAL_PROHIBITED_PHRASES)) return prohibitedOn('body');
  const [helper] = await db
    .select({ firstName: users.firstName, headline: helperProfiles.headline, tools: helperProfiles.tools })
    .from(users)
    .innerJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .where(eq(users.id, viewer.id))
    .limit(1);
  if (!helper) return { ok: false, code: 'not_allowed' };
  const limited = await overLimit(db, `assist:answer:${viewer.id}`, ANSWER_RULE, now);
  if (limited) return limited;
  const categorySlug = post.categorySlug;
  return asAiResult('assist-answer', 'body', async () => {
    const answer = await writer.answer({
      post: { kind: post.kind as CommunityPostKind, title: clean(post.title), body: clean(post.body), categorySlug },
      helper: { firstName: helper.firstName, ...(helper.headline ? { headline: clean(helper.headline) } : {}), services, tools: helper.tools },
      notes: clean(notes),
      locale,
    });
    return { body: clean(answer) };
  });
}
