'use server';

import { refresh, updateTag } from 'next/cache';
import { z } from 'zod';
import type { ActionResult, BotCheckInput, OfferActionId, OfferInput, PriceBreakdown, PricingInput } from '@/contracts';
import { checkBot } from '@/modules/accounts/bot-check';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { helperOfferAction, quoteForHelper, reviseOffer, setTaskMark, submitOffer, submitQuickOffer, withdrawOfferOnTask } from './helper';
import { requestNow } from '@/platform/clock';

/** Server Actions behind the helper work screens (src/contracts/helper-work.ts, HelperWorkHandlers). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

/** Offer counts show on public task pages and the board. */
function afterOfferChange() {
  updateTag('tasks');
  refresh();
}

const quoteInput = z.object({
  pricing: z.discriminatedUnion('type', [
    z.object({ type: z.literal('fixed'), priceCents: z.number().int().min(0).max(10_000_000) }),
    z.object({
      type: z.literal('hourly'),
      rateCents: z.number().int().min(0).max(100_000),
      estimatedHours: z.number().min(0).max(24),
      hoursCap: z.number().min(0).max(24),
    }),
  ]),
});

/** The helper's earnings for a price. Throws (the UI shows "couldn't load") on bad input or no fees. */
export async function quoteOfferAction(input: { pricing: PricingInput }): Promise<PriceBreakdown> {
  const userId = await signedInUserId();
  if (!userId) throw new Error('Not signed in');
  const parsed = quoteInput.safeParse(input);
  if (!parsed.success) throw new Error('Invalid price');
  const quote = await quoteForHelper(db, userId, parsed.data.pricing, await requestNow());
  if (!quote) throw new Error('No fee schedule for this market');
  return quote;
}

/** Bound to the task id by the page: `submitOfferAction.bind(null, taskId)`. */
export async function submitOfferAction(taskId: string, input: OfferInput & BotCheckInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  // Turnstile before anything is saved (blueprint 07 §2: offer forms).
  const refused = await checkBot('offer', input?.botCheck);
  if (refused) return refused;
  const result = await submitOffer(db, userId, String(taskId), input, await requestNow());
  if (result.ok) afterOfferChange();
  return result;
}

/** Bound to the task id by the page. */
export async function reviseOfferAction(taskId: string, input: OfferInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await reviseOffer(db, userId, String(taskId), input, await requestNow());
  if (result.ok) afterOfferChange();
  return result;
}

/** Withdraw or re-confirm the helper's own offer. */
export async function helperOfferActionHandler(input: { offerId: string; action: OfferActionId }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await helperOfferAction(db, userId, String(input.offerId), input.action, await requestNow());
  if (result.ok && !result.redirectTo) afterOfferChange();
  return result;
}

const taskInput = z.object({ taskId: z.string().min(1).max(64) });

/** FindWorkHandlers.onQuickOffer: the one-tap offer at the poster's price (fixed-price tasks only). */
export async function quickOfferAction(input: { taskId: string } & BotCheckInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  const parsed = taskInput.safeParse({ taskId: input?.taskId });
  if (!userId || !parsed.success) return { ok: false, code: 'not_allowed' };
  const refused = await checkBot('offer', input?.botCheck);
  if (refused) return refused;
  const result = await submitQuickOffer(db, userId, parsed.data.taskId, await requestNow());
  if (result.ok) afterOfferChange();
  return result;
}

/** FindWorkHandlers.onUndoQuickOffer: Undo right after a one-tap offer (withdraws it). */
export async function undoQuickOfferAction(input: { taskId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  const parsed = taskInput.safeParse({ taskId: input?.taskId });
  if (!userId || !parsed.success) return { ok: false, code: 'not_allowed' };
  const result = await withdrawOfferOnTask(db, userId, parsed.data.taskId, await requestNow());
  if (result.ok) afterOfferChange();
  return result;
}

const markInput = z.object({ taskId: z.string().min(1).max(64), on: z.boolean() });

/** FindWorkHandlers.onSaveTask: save an open task for later (or not). */
export async function saveTaskAction(input: { taskId: string; saved: boolean }): Promise<ActionResult> {
  const userId = await signedInUserId();
  const parsed = markInput.safeParse({ taskId: input?.taskId, on: input?.saved });
  if (!userId || !parsed.success) return { ok: false, code: 'not_allowed' };
  return setTaskMark(db, userId, { taskId: parsed.data.taskId, kind: 'saved', on: parsed.data.on }, await requestNow());
}

/** FindWorkHandlers.onHideTask: not interested (the task leaves find work), or Undo. */
export async function hideTaskAction(input: { taskId: string; hidden: boolean }): Promise<ActionResult> {
  const userId = await signedInUserId();
  const parsed = markInput.safeParse({ taskId: input?.taskId, on: input?.hidden });
  if (!userId || !parsed.success) return { ok: false, code: 'not_allowed' };
  return setTaskMark(db, userId, { taskId: parsed.data.taskId, kind: 'hidden', on: parsed.data.on }, await requestNow());
}
