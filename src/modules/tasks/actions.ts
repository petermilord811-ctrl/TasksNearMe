'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { cookies } from 'next/headers';
import type {
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
import { CATEGORY_SLUGS, routes } from '@/contracts';
import { photoFromFile, storePhoto } from '@/modules/files/uploads';
import { files } from '@/modules/tasks/schema';
import { marketTag } from '@/modules/marketing/queries';
import { getFlags, getPublishedPolicy } from '@/modules/markets/queries';
import { categories, markets } from '@/modules/markets/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { AI_STAND_IN_COOKIE, AiRefusedError, AiUnavailableError, wantsAiStandIn } from '@/integrations/ai';
import { createFakeTaskDrafter } from '@/integrations/ai/task-drafter';
import { findProhibitedPhrase, maskContactDetails } from '@/modules/trust/contact-masking';
import { GLOBAL_PROHIBITED_PHRASES } from '@/modules/trust/prohibited';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import { fileStorage, homeMarketIdOf, taskDrafter, taskPosting } from './server';

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
  const text = String(input.text ?? '').trim().slice(0, 1000);
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
    const draft = await drafter.draft({ categorySlug: input.categorySlug, text });
    // The task board is public: no phone numbers, emails or links, whatever was typed.
    return { ok: true, draft: { ...draft, title: maskContactDetails(draft.title).text, description: maskContactDetails(draft.description).text } };
  } catch (error) {
    if (error instanceof AiRefusedError) return { ok: false, code: 'prohibited' };
    if (!(error instanceof AiUnavailableError)) console.error('[ai-draft]', error);
    return { ok: false, code: 'unavailable' };
  }
}

export async function searchTaskAddresses(input: { query: string }): Promise<AddressSuggestion[]> {
  const userId = await signedInUserId();
  if (!userId) return [];
  return taskPosting.searchAddresses(userId, String(input.query ?? '').slice(0, 120));
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

export async function postTaskAction(input: TaskDraftInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const outcome = await taskPosting.post(userId, input);
  if (!outcome.ok) return outcome.result;

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
