import { and, eq } from 'drizzle-orm';
import type { AddressRejectionReason } from '@/contracts';
import { getFlags } from '@/modules/markets/queries';
import { users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { auditLog } from '@/platform/audit/schema';
import { expireCacheTags } from '@/platform/cache/expire';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { addressVerifications } from './schema';
import { emitVerificationEvent, syncHelperProfile } from './state';

/**
 * Applying the automatic decision on a proof of address (address-verdict.ts) as our server's own, the way a staff
 * decision applies (staff.ts `decideAddress`): the proof is verified or turned down with its reason, `decided_by` says
 * `auto` (no staff member), the audit log says the system did it, the helper is told, and their profile and public pages
 * follow. Only a proof still in review changes, so a staff decision that came first stands.
 */

/** The `auto_verification` flag for the person's home market (on by default; staff switch it off on the config page). */
export async function autoVerificationOn(db: Db, userId: string): Promise<boolean> {
  const [person] = await db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!person?.marketId) return false;
  return (await getFlags(person.marketId, db)).auto_verification === true;
}

export async function applyAddressAutoDecision(
  db: Db,
  proof: { id: string; userId: string },
  verdict: { decision: 'approved' } | { decision: 'rejected'; rejectionReason: AddressRejectionReason },
  now: Date,
): Promise<boolean> {
  const approved = verdict.decision === 'approved';
  const reason = verdict.decision === 'rejected' ? verdict.rejectionReason : null;
  const [updated] = await db
    .update(addressVerifications)
    .set({ status: approved ? 'verified' : 'rejected', decidedAt: now, decidedByUserId: null, decidedBy: 'auto', rejectionReason: reason, updatedAt: now })
    .where(and(eq(addressVerifications.id, proof.id), eq(addressVerifications.status, 'in_review')))
    .returning({ id: addressVerifications.id });
  if (!updated) return false;
  await db.insert(auditLog).values({
    id: newId('aud'),
    actorRole: 'system',
    action: approved ? 'address.verified' : 'address.rejected',
    targetType: 'user',
    targetId: proof.userId,
    metadata: { verificationId: proof.id, decidedBy: 'auto', ...(reason ? { reason } : {}) },
  });
  await emitVerificationEvent(db, proof.userId, 'address', approved ? 'passed' : 'action_needed');
  await syncHelperProfile(db, proof.userId, now);
  // The public profile's "Address verified" and the lists it's in (a job can't call updateTag).
  const [profile] = await db.select({ handle: helperProfiles.handle }).from(helperProfiles).where(eq(helperProfiles.userId, proof.userId)).limit(1);
  await expireCacheTags(db, ['helpers', ...(profile ? [`helper:${profile.handle}`] : [])]);
  return true;
}
