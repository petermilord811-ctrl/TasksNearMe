import { and, eq, ne } from 'drizzle-orm';
import type { IdentityCaptureRejectionReason } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { idDoubleCheckFor } from './providers';
import { identityCaptures, identityVerifications, type StoredIdentityAutoCheck } from './schema';
import { emitVerificationEvent, syncHelperProfile } from './state';

/**
 * Deciding our own ID check's photos, by our team or by the automatic checks (id-verdict.ts), the same way: the capture
 * approved or rejected (with its reason), who decided (`auto`, or `staff` with their id) and when. An approval where no
 * ID provider double-checks (idDoubleCheckFor: no Persona or Stripe Identity set up, as on the live site today) is the
 * verification itself (owner, 2026-11-27: our own server checks the license, no paid services): a verified ID check of
 * provider `own` is recorded for it, so the badge, the ID's expiry month, renewals and the name check work as they do
 * after a provider's check. With a double check, the provider's result verifies, as before. Callers write the audit row.
 */

export type CaptureDecider = { kind: 'auto' } | { kind: 'staff'; userId: string };

export interface CaptureDecisionInput {
  captureId: string;
  decision: 'approve' | 'reject';
  reason?: IdentityCaptureRejectionReason;
  /** Staff's note (never shown to the helper). */
  note?: string | null;
  decider: CaptureDecider;
}

/** The capture's person, or null when it wasn't in review any more (or is the deciding staff member's own). */
export async function applyCaptureDecision(db: Db, input: CaptureDecisionInput, now: Date, options: { doubleCheck?: boolean } = {}): Promise<{ userId: string; verified: boolean } | null> {
  const { captureId, decision, decider } = input;
  const staffId = decider.kind === 'staff' ? decider.userId : null;
  const [decided] = await db
    .update(identityCaptures)
    .set({
      status: decision === 'approve' ? 'approved' : 'rejected',
      rejectionReason: decision === 'reject' ? (input.reason ?? 'other') : null,
      decidedAt: now,
      decidedByUserId: staffId,
      decidedBy: decider.kind,
      staffNote: input.note ?? null,
      updatedAt: now,
    })
    // Never on one's own account: another staff member decides (sweep 2026-11-20, security review).
    .where(and(eq(identityCaptures.id, captureId), eq(identityCaptures.status, 'submitted'), ...(staffId ? [ne(identityCaptures.userId, staffId)] : [])))
    .returning({ userId: identityCaptures.userId, autoCheck: identityCaptures.autoCheck });
  if (!decided) return null;
  const { userId } = decided;
  const doubleCheck = options.doubleCheck ?? idDoubleCheckFor(process.env);
  let verified = false;
  let nameMatches = true;
  if (decision === 'approve' && !doubleCheck) {
    const check = decided.autoCheck as StoredIdentityAutoCheck | null;
    // Our team approves after comparing the name too; a reading that said it differs still goes to the name check.
    nameMatches = check?.nameMatches !== false;
    await db.insert(identityVerifications).values({
      id: newId('idv'),
      userId,
      provider: 'own',
      providerSessionId: captureId,
      status: 'verified',
      isAdult: true,
      nameMatches,
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    verified = true;
  }
  // Verified (and the name matched): passed. Otherwise the helper has something to do or wait for: the double check,
  // the name check, or new photos.
  await emitVerificationEvent(db, userId, 'identity', verified && nameMatches ? 'passed' : 'action_needed');
  await syncHelperProfile(db, userId, now);
  return { userId, verified };
}
