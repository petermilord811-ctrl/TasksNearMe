'use server';

import { refresh } from 'next/cache';
import type { AcceptProposalInput, ActionResult, PaymentAttemptResult, PriceBreakdown, PricingInput, RebookProposalInput } from '@/contracts';
import { bookingDeps } from '@/modules/bookings/server';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { acceptProposal, declineProposal, finishProposalVerification, proposeRebook, quoteRebook, withdrawProposal } from './service';
import { requestNow } from '@/platform/clock';

/** Server Actions behind My clients, proposing, and answering a proposal (src/contracts/rebook.ts). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function refreshed<T extends { ok: boolean }>(result: T): T {
  if (result.ok) refresh();
  return result;
}

export async function quoteRebookAction(bookingId: string, input: { pricing: PricingInput }): Promise<PriceBreakdown> {
  const userId = await signedInUserId();
  const quote = userId ? await quoteRebook(db, userId, String(bookingId), input.pricing) : null;
  if (!quote) throw new Error('No quote');
  return quote;
}

export async function proposeRebookAction(bookingId: string, input: RebookProposalInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await proposeRebook(db, userId, String(bookingId), input, await requestNow()));
}

export async function acceptProposalAction(proposalId: string, input: AcceptProposalInput): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return refreshed(await acceptProposal(deps, userId, String(proposalId), input, await requestNow()));
}

export async function finishProposalVerificationAction(proposalId: string, input: { paymentId: string; outcome: 'approved' | 'failed' }): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return refreshed(await finishProposalVerification(deps, userId, String(proposalId), String(input.paymentId), input.outcome, await requestNow()));
}

export async function declineProposalAction(proposalId: string): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await declineProposal(db, userId, String(proposalId), await requestNow()));
}

export async function withdrawProposalAction(proposalId: string): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await withdrawProposal(db, userId, String(proposalId), await requestNow()));
}
