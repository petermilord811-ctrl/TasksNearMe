'use server';

import { refresh } from 'next/cache';
import type { ActionResult, BetaGateInput, InviteCodeCreateInput, InviteCodeInput } from '@/contracts';
import { inviteCodeInputSchema, routes } from '@/contracts';
import { staffActorOf, type StaffActor } from '@/modules/support/staff';
import { rateLimited, validationFailed } from '@/platform/actions/results';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import type { InviteUse } from './rules';
import { clearInvitedCode, marketIdOf } from './server';
import { createInviteCode, redeemInvite, revokeInviteCode, setBetaGate } from './service';

/** Server Actions for the private beta (src/contracts/beta.ts): entering an invite, and the staff page. */

/** Enough for a person with a typo or two, too few to guess codes. */
const REDEEM_RULE = { limit: 10, windowSeconds: 10 * 60 };

async function redeem(input: InviteCodeInput, use: InviteUse): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') {
    refresh();
    return { ok: false, code: 'not_allowed' };
  }
  const parsed = inviteCodeInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const now = await requestNow();
  const limited = await consumeRateLimit(db, `beta-invite:user:${viewer.user.id}`, REDEEM_RULE, now);
  if (!limited.ok) return rateLimited(limited.retryAt);
  const marketId = await marketIdOf(db, viewer.user.id);
  if (!marketId) return { ok: false, code: 'not_found' };
  const result = await redeemInvite(db, { userId: viewer.user.id, marketId, code: parsed.data.inviteCode, use }, now);
  if (result.ok) await clearInvitedCode();
  return result;
}

/** The sign-in `invite_code` step: the page shows the next step (the name and age). */
export async function redeemSignUpInvite(_next: string, input: InviteCodeInput): Promise<ActionResult> {
  const result = await redeem(input, 'sign_up');
  if (result.ok) refresh();
  return result;
}

/** The helper invite screen: on to the first setup step. */
export async function redeemHelperInvite(input: InviteCodeInput): Promise<ActionResult> {
  const result = await redeem(input, 'helper_setup');
  return result.ok ? { ...result, redirectTo: routes.app.helperOnboarding() } : result;
}

// ---- Staff ----------------------------------------------------------------------------------------------

async function staff(): Promise<StaffActor | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
}

function refreshed(result: ActionResult): ActionResult {
  if (result.ok) refresh();
  return result;
}

export async function createInviteCodeAction(input: InviteCodeCreateInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await createInviteCode(db, actor, input, await requestNow()));
}

export async function revokeInviteCodeAction(input: { id: string }): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await revokeInviteCode(db, actor, String(input?.id ?? ''), await requestNow()));
}

export async function setBetaGateAction(input: BetaGateInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await setBetaGate(db, actor, input));
}
