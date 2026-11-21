'use server';

import { refresh } from 'next/cache';
import { aiReadingSetUp } from '@/integrations/ai';
import { readIdBarcode } from '@/integrations/ocr';
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
  IdentityDetailsRevealInput,
  IdentityDetailsRevealResult,
  VerificationActionInput,
} from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { verificationCipher, verificationProviders } from './server';
import type { IdReadingDeps } from './auto-check';
import { canDecideVerification, decideAddress, decideIdentityCapture, readCaptureNow, revealAddressProof, revealIdentityCapture, revealIdentityDetails, verificationAction } from './staff';

/** Server Actions behind staff verification reviews (src/contracts/admin-verification.ts). */

/**
 * What a staff request may read: only a test account's ID photos, with the stand-in (it reads nothing, at once), so
 * seeded people and e2e flows show their reading when staff open them. Everyone else's wait for the job
 * (verification.read_documents), the only place the server's own reader runs: a second or two of CPU and up to
 * about 200 MB a read, one at a time. Approval waits for that reading (`not_ready`, at most `ID_READING_WAIT_MS`
 * after the photos were sent).
 */
function requestReading(): IdReadingDeps {
  return { storage: createFileStorage(), files: byteCipherFromEnv(), reader: null, testAccountsOnly: true };
}

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
  // Opening a test account's photos reads them if the job hasn't yet (5.18), so the page shows the reading and any duplicate.
  const read = canDecideVerification(staff) && typeof input?.captureId === 'string' && (await readCaptureNow(db, requestReading(), input.captureId, now));
  const result = await revealIdentityCapture(db, { secret }, staff, input, now);
  if (read) refresh();
  return result;
}

/**
 * The ID's details from the barcode on its back, before the photos (owner, 2026-11-21). The barcode is read in the
 * readers' own process (a fraction of a second, after any read the job is running), never stored; why is logged.
 */
export async function revealIdentityDetailsAction(input: IdentityDetailsRevealInput): Promise<IdentityDetailsRevealResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  return revealIdentityDetails(db, { storage: createFileStorage(), files: byteCipherFromEnv(), addressCipher: verificationCipher, readBarcode: (back) => readIdBarcode(back) }, staff, input, await requestNow());
}

export async function decideIdentityCaptureAction(input: IdentityCaptureDecisionInput): Promise<ActionResult> {
  const staff = await signedInStaff();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await decideIdentityCapture(db, staff, input, await requestNow(), { reading: requestReading(), readerOn: aiReadingSetUp() });
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
