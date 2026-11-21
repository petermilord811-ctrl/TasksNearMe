'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import type {
  BotCheckInput,
  ActionResult,
  AddressSuggestion,
  AiDraftResult,
  CategorySlug,
  Cents,
  Photo,
  PhotoUploadResult,
  PriceBreakdown,
  PricingInput,
  TaskDraftInput,
} from '@/contracts';
import { CATEGORY_SLUGS, localeOrDefault, requestKeyField, routes, TASK_DESCRIPTION_MAX } from '@/contracts';
import { photoFromFile, storePhoto } from '@/modules/files/uploads';
import { files, tasks } from '@/modules/tasks/schema';
import { marketTag } from '@/modules/marketing/queries';
import { getFlags, getPublishedPolicy } from '@/modules/markets/queries';
import { categories, markets } from '@/modules/markets/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { AI_STAND_IN_COOKIE, AiRefusedError, AiUnavailableError, wantsAiStandIn } from '@/integrations/ai';
import { createFakeTaskDrafter } from '@/integrations/ai/task-drafter';
import { GEO_STAND_IN_COOKIE, wantsGeoStandIn } from '@/integrations/geocoding';
import { findProhibitedPhrase, maskContactDetails } from '@/modules/trust/contact-masking';
import { GLOBAL_PROHIBITED_PHRASES } from '@/modules/trust/prohibited';
import { checkBot } from '@/modules/accounts/bot-check';
import { linkCommunityPostToTask } from '@/modules/community/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import { fileStorage, homeMarketIdOf, sampleAddressTaskPosting, taskDrafter, taskPosting } from './server';
import { clientInviteMarket } from '@/modules/beta/server';

/** Server Actions behind PostTaskScreen (src/contracts/posting.ts, PostTaskHandlers). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

const AI_DRAFT_RULE = { limit: 10, windowSeconds: 60 * 60 };

export async function draftTaskWithAi(input: { categorySlug: CategorySlug; text: string }): Promise<AiDraftResult> {
  const userId = await signedInUserId();
  const marketId = userId ? await homeMarketIdOf(userId) : null;
  if (!userId || !marketId || !taskDrafter) return { ok: false, code: 'unavailable' };
  if (!(await getFlags(marketId)).ai_drafting) return { ok: false, code: 'unavailable' };
  if (!(CATEGORY_SLUGS as readonly string[]).includes(input.categorySlug)) return { ok: false, code: 'unavailable' };
  // The whole description field: the rewrite works on what the person has written so far.
  const text = String(input.text ?? '').trim().slice(0, TASK_DESCRIPTION_MAX);
  if (text.length < 3) return { ok: false, code: 'unavailable' };

  const limited = await consumeRateLimit(db, `ai-draft:user:${userId}`, AI_DRAFT_RULE);
  if (!limited.ok) return { ok: false, code: 'rate_limited' };

  const [category] = await db
    .select({ keywords: categories.prohibitedKeywords })
    .from(categories)
    .where(eq(categories.slug, input.categorySlug))
    .limit(1);
  if (findProhibitedPhrase(text, [...GLOBAL_PROHIBITED_PHRASES, ...(category?.keywords ?? [])])) {
    return { ok: false, code: 'prohibited' };
  }
  // Tests ask for the stand-in, so they never reach Claude where a key is set.
  const drafter = wantsAiStandIn((await cookies()).get(AI_STAND_IN_COOKIE)?.value) ? createFakeTaskDrafter() : taskDrafter;
  try {
    const draft = await drafter.draft({ categorySlug: input.categorySlug, text, locale: localeOrDefault(await getLocale()) });
    // The task board is public: no phone numbers, emails or links, whatever was typed.
    return { ok: true, draft: { ...draft, title: maskContactDetails(draft.title).text, description: maskContactDetails(draft.description).text } };
  } catch (error) {
    if (error instanceof AiRefusedError) return { ok: false, code: 'prohibited' };
    if (!(error instanceof AiUnavailableError)) console.error('[ai-draft]', error);
    return { ok: false, code: 'unavailable' };
  }
}

/** Tests ask for the sample addresses, so they never reach Mapbox where a token is set. */
async function postingForRequest() {
  const standIn = wantsGeoStandIn((await cookies()).get(GEO_STAND_IN_COOKIE)?.value);
  return standIn && sampleAddressTaskPosting ? sampleAddressTaskPosting : taskPosting;
}

/** Each search is one Mapbox request (free up to 100,000 a month): plenty for typing, not for a script. */
const ADDRESS_SEARCH_RULE = { limit: 120, windowSeconds: 10 * 60 };

export async function searchTaskAddresses(input: { query: string }): Promise<AddressSuggestion[]> {
  const userId = await signedInUserId();
  if (!userId) return [];
  const query = String(input.query ?? '').slice(0, 120);
  if (query.trim().length < 3) return [];
  const limited = await consumeRateLimit(db, `address-search:user:${userId}`, ADDRESS_SEARCH_RULE);
  // A failed search reads as "Address search is unavailable. Try again in a moment."
  if (!limited.ok) throw new Error('Too many address searches; try again in a few minutes.');
  return (await postingForRequest()).searchAddresses(userId, query);
}

export async function uploadTaskPhoto(formData: FormData): Promise<PhotoUploadResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unknown' };
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, code: 'unsupported_type' };
  return storePhoto({ db, storage: fileStorage }, { userId, kind: 'task_photo', file });
}

function isPricingInput(value: unknown): value is PricingInput {
  const budget = value as PricingInput | undefined;
  if (!budget) return false;
  if (budget.type === 'fixed') return Number.isInteger(budget.priceCents) && budget.priceCents > 0;
  return (
    budget.type === 'hourly' &&
    Number.isInteger(budget.rateCents) &&
    budget.rateCents > 0 &&
    budget.hoursCap > 0 &&
    budget.hoursCap <= 24 &&
    budget.estimatedHours > 0
  );
}

/** The poster's price breakdown for the review step, from the fee engine and the market policy. */
export async function quoteTaskPrice(input: { budget: PricingInput; expenseAllowanceCents: Cents }): Promise<PriceBreakdown> {
  const userId = await signedInUserId();
  const marketId = userId ? await homeMarketIdOf(userId) : null;
  const policy = marketId ? await getPublishedPolicy(marketId) : null;
  if (!policy || !isPricingInput(input.budget)) throw new Error('Cannot quote this budget.');
  const allowance = Number.isInteger(input.expenseAllowanceCents) && input.expenseAllowanceCents > 0 ? input.expenseAllowanceCents : 0;
  return quoteBreakdown(policy.fees, input.budget, { expenseAllowanceCents: allowance });
}

/** Posting attempts per person (B-061 rate-limit review). */
const POSTING_RULE = { limit: 30, windowSeconds: 60 * 60 };

export async function postTaskAction(input: TaskDraftInput & BotCheckInput & { fromPostId?: string; requestKey?: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  // The same post again, after an answer that never arrived (the draft's key): the task it made, even if the draft
  // changed since, and before the bot check, whose token the first post used (bad connections pass, J-N1).
  const requestKey = requestKeyField.safeParse(input?.requestKey);
  if (requestKey.success) {
    const [posted] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.posterUserId, userId), eq(tasks.requestKey, requestKey.data))).limit(1);
    if (posted) return { ok: true, code: 'submitted', redirectTo: routes.app.task(posted.id) };
  }
  // A market opening soon takes clients by invitation (J-V8): the page shows that step instead of the form.
  if (await clientInviteMarket(db, userId)) return { ok: false, code: 'not_allowed' };
  // Turnstile before anything is saved (blueprint 06 §4: posting).
  const refused = await checkBot('post_task', input?.botCheck);
  if (refused) return refused;
  // A backstop for accounts past their first week (whose open tasks aren't capped): plenty for a person.
  const limited = await consumeRateLimit(db, `post-task:user:${userId}`, POSTING_RULE);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const outcome = await (await postingForRequest()).post(userId, input, requestKey.success ? { requestKey: requestKey.data } : {});
  if (!outcome.ok) return outcome.result;
  // "Ask for help" (plan 9.10): the author's own community post becomes this task's discussion, and links to it.
  if (typeof input?.fromPostId === 'string' && input.fromPostId) await linkCommunityPostToTask(db, userId, input.fromPostId, outcome.taskId, new Date());

  // Boards, market pages, and the new task page show it right away.
  const marketId = await homeMarketIdOf(userId);
  const [market] = marketId ? await db.select({ slug: markets.slug }).from(markets).where(eq(markets.id, marketId)) : [];
  updateTag('tasks');
  if (market) updateTag(marketTag(market.slug));
  return { ok: true, code: 'submitted', redirectTo: routes.app.task(outcome.taskId) };
}

/** Thumbnails for photo ids restored from a saved draft: only the person's own task photos. */
export async function resolveTaskPhotos(input: { photoIds: string[] }): Promise<Photo[]> {
  const userId = await signedInUserId();
  const ids = Array.isArray(input.photoIds) ? input.photoIds.filter((id) => typeof id === 'string').slice(0, 8) : [];
  if (!userId || ids.length === 0) return [];
  const rows = await db
    .select()
    .from(files)
    .where(and(inArray(files.id, ids), eq(files.ownerUserId, userId), eq(files.kind, 'task_photo')));
  const byId = new Map(rows.map((row) => [row.id, photoFromFile(row)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
