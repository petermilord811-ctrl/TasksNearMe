'use server';

import { refresh, updateTag } from 'next/cache';
import type { ActionResult, CounterInviteInput, PaymentAttemptResult, PriceBreakdown, PricingInput, RequestHelperInput } from '@/contracts';
import { createPaymentProvider } from '@/integrations/payments';
import { bookingDeps } from '@/modules/bookings/server';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import {
  acceptCounter,
  acceptInvite,
  cancelInvite,
  counterInvite,
  declineCounter,
  declineInvite,
  finishCounterVerification,
  finishRequestVerification,
  quoteInvite,
  requestHelper,
} from './service';
import { requestNow } from '@/platform/clock';

/** Server Actions behind requesting a helper and answering invites (src/contracts/invites.ts). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function refreshed<T extends { ok: boolean }>(result: T): T {
  if (result.ok) refresh();
  return result;
}

export async function quoteInviteAction(input: { pricing: PricingInput }): Promise<PriceBreakdown> {
  const userId = await signedInUserId();
  const quote = userId ? await quoteInvite(db, userId, input.pricing) : null;
  if (!quote) throw new Error('No quote');
  return quote;
}

export async function requestHelperAction(handle: string, input: RequestHelperInput): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  const result = await requestHelper(deps, userId, String(handle), input, await requestNow());
  // A requested slot leaves the helper's public profile.
  if (input.slotId && (result.ok || ('code' in result && result.code === 'requires_bank_verification'))) updateTag(`helper:${handle}`);
  return result;
}

export async function finishRequestVerificationAction(input: { paymentId: string; outcome: 'approved' | 'failed' }): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return finishRequestVerification(deps, userId, String(input.paymentId), input.outcome === 'approved' ? 'approved' : 'failed', await requestNow());
}

export async function acceptInviteAction(input: { inviteId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return refreshed(await acceptInvite(deps, userId, String(input.inviteId), await requestNow()));
}

export async function declineInviteAction(input: { inviteId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await declineInvite(db, createPaymentProvider(), userId, String(input.inviteId), await requestNow()));
}

export async function counterInviteAction(input: { inviteId: string; counter: CounterInviteInput }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await counterInvite(db, createPaymentProvider(), userId, String(input.inviteId), input.counter, await requestNow()));
}

export async function cancelInviteAction(input: { inviteId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await cancelInvite(db, createPaymentProvider(), userId, String(input.inviteId), await requestNow()));
}

export async function acceptCounterAction(input: { inviteId: string }): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return refreshed(await acceptCounter(deps, userId, String(input.inviteId), await requestNow()));
}

export async function declineCounterAction(input: { inviteId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await declineCounter(db, createPaymentProvider(), userId, String(input.inviteId), await requestNow()));
}

export async function finishInviteVerificationAction(input: { inviteId: string; paymentId: string; outcome: 'approved' | 'failed' }): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return refreshed(await finishCounterVerification(deps, userId, String(input.inviteId), String(input.paymentId), input.outcome === 'approved' ? 'approved' : 'failed', await requestNow()));
}
