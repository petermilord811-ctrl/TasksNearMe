'use server';

import { refresh } from 'next/cache';
import { idReaderFromEnv } from '@/integrations/ai/id-document-reader';
import { createFileStorage } from '@/integrations/storage';
import { byteCipherFromEnv } from '@/platform/crypto/field-encryption';
import type {
  ActionResult,
  AddressDecisionInput,
  AddressProofRevealInput,
  AddressProofRevealResult,
  IdentityCaptureDecisionInput,
  IdentityCaptureRevealInput,
  IdentityCaptureRevealResult,
  VerificationActionInput,
} from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { verificationCipher, verificationProviders } from './server';
import type { IdReadingDeps } from './auto-check';
import { canDecideVerification, decideAddress, decideIdentityCapture, readCaptureNow, revealAddressProof, revealIdentityCapture, verificationAction } from './staff';

/** The ID reader the job uses (verification.read_documents), for reading a capture when staff open or approve it. */
function idReading(): IdReadingDeps {
  return { storage: createFileStorage(), files: byteCipherFromEnv(), reader: idReaderFromEnv() };
}

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

/** Links to our own ID check's photos (5 minutes), after a logged reason. */
export async function revealIdentityCaptureAction(input: IdentityCaptureRevealInput): Promise<IdentityCaptureRevealResult> {
  const staff = await signedInStaff();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!staff || !secret) return { ok: false, code: 'not_allowed' };
  const now = await requestNow();
  // Opening the photos reads them if the job hasn't yet (5.18), so the page shows the reading and any duplicate.
  const read = canDecideVerification(staff) && typeof input?.captureId === 'string' && (await readCaptureNow(db, idReading(), input.captureId, now));
  const result = await revealIdentityCapture(db, { secret }, staff, input, now);
  if (read) refresh();
  return result;
}

export async function decideIdentityCaptureAction(input: IdentityCaptureDecisionInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await decideIdentityCapture(db, staff, input, await requestNow(), { reading: idReading() });
  // A duplicate the reading just found: the page shows it before anyone approves.
  if (result.ok || (!result.ok && result.code === 'version_conflict')) refresh();
  return result;
}

export async function verificationStaffAction(input: VerificationActionInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await verificationAction(db, verificationProviders, staff, input, await requestNow());
  if (result.ok) refresh();
  return result;
}
