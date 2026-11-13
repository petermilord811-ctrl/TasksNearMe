'use server';

import { refresh } from 'next/cache';
import type { ActionResult, AddressDecisionInput, AddressProofRevealInput, AddressProofRevealResult, VerificationActionInput } from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { verificationCipher, verificationProviders } from './server';
import { decideAddress, revealAddressProof, verificationAction } from './staff';

/** Server Actions behind staff verification reviews (src/contracts/admin-verification.ts). */

async function signedInStaff() {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
}

export async function revealAddressProofAction(input: AddressProofRevealInput): Promise<AddressProofRevealResult> {
  const staff = await signedInStaff();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!staff || !secret) return { ok: false, code: 'not_allowed' };
  return revealAddressProof(db, { cipher: verificationCipher, secret }, staff, input, await requestNow());
}

export async function decideAddressAction(input: AddressDecisionInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await decideAddress(db, staff, input, await requestNow());
  if (result.ok) refresh();
  return result;
}

export async function verificationStaffAction(input: VerificationActionInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await verificationAction(db, verificationProviders, staff, input, await requestNow());
  if (result.ok) refresh();
  return result;
}
