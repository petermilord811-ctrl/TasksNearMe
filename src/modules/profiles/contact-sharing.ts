import { and, eq, ne } from 'drizzle-orm';
import { contactSettingSharesPhone, type ActionResult, type HelperContactAccess, type HelperContactReveal } from '@/contracts';
import { smsAvailable } from '@/integrations/sms';
import { users } from '@/modules/accounts/schema';
import { earnedSparks } from '@/modules/sparks/domain';
import { sparkTallies } from '@/modules/sparks/service';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { helperProfiles } from './schema';
import { HELPER_CONTACT_REVEALS_PER_DAY, helperContactAccess, isContactSharingSetting, sharedKinds, type HelperContactFacts } from './contact-access';

export { HELPER_CONTACT_REVEALS_PER_DAY } from './contact-access';

/**
 * Contact details on a helper's profile (owner, 2026-11-24: "last two top milestone can see helper's profile: email and
 * phone number"; then, asked how: shown only for helpers who turn it on). A helper chooses on the account page what
 * their profile shares (`CONTACT_SHARING_SETTINGS`, nothing by default); neighbors who've **earned**
 * `HELPER_CONTACT_EARNED_MIN` Sparks (Pillar and Local legend) see it with a tap. Bought Sparks never count toward it,
 * so nobody can pay their way to someone's number.
 *
 * The details are never part of the profile page itself (it's cached for everyone): the panel is worked out for each
 * viewer, and the email and phone travel only in the answer to "Show", which is limited per day and written to the
 * audit log, so a list of helpers' numbers can't be collected quietly.
 */

async function helperContactRow(db: Db, helperId: string) {
  const [row] = await db
    .select({
      email: users.email,
      emailVerified: users.emailVerified,
      phone: users.phone,
      phoneVerifiedAt: users.phoneVerifiedAt,
      status: users.status,
      contactSharing: users.contactSharing,
      profileStatus: helperProfiles.status,
    })
    .from(users)
    .innerJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .where(eq(users.id, helperId))
    .limit(1);
  return row;
}

/** Everything the panel depends on, read for this viewer and helper; null when the helper shares nothing that can show. */
async function contactFacts(db: Db, viewerId: string, helperId: string) {
  const helper = await helperContactRow(db, helperId);
  if (!helper) return null;
  const shares = sharedKinds(helper.contactSharing, { email: helper.emailVerified && helper.email.length > 0, phone: helper.phoneVerifiedAt !== null && Boolean(helper.phone) });
  if (shares.length === 0) return null;
  const [[viewer], blocked, tallies] = await Promise.all([
    db.select({ status: users.status }).from(users).where(eq(users.id, viewerId)).limit(1),
    viewerId === helperId ? Promise.resolve(false) : isBlockedBetween(db, viewerId, helperId),
    sparkTallies(db, [viewerId]),
  ]);
  const tally = tallies.get(viewerId);
  const facts: HelperContactFacts = {
    self: viewerId === helperId,
    shares,
    helperActive: helper.status === 'active' && helper.profileStatus === 'active',
    viewerActive: viewer?.status === 'active',
    blocked,
    earned: tally ? earnedSparks(tally.counts).earned : 0,
  };
  return { helper, facts };
}

/** The contact panel on `/helpers/[handle]` for this viewer (none for visitors who aren't signed in). */
export async function getHelperContactAccess(db: Db, viewerId: string | null, helperId: string): Promise<HelperContactAccess | undefined> {
  if (!viewerId) return undefined;
  const found = await contactFacts(db, viewerId, helperId);
  return found ? helperContactAccess(found.facts) : undefined;
}

/**
 * "Show email and phone": the details, for a viewer who may see them, counted against the day's allowance and
 * recorded in the audit log (who saw whose, and what).
 */
export async function revealHelperContact(db: Db, viewerId: string, input: { helperId?: unknown }, now: Date): Promise<HelperContactReveal> {
  const helperId = typeof input?.helperId === 'string' ? input.helperId : '';
  if (!helperId) return { ok: false, code: 'not_allowed' };
  const found = await contactFacts(db, viewerId, helperId);
  if (!found || helperContactAccess(found.facts)?.state !== 'reveal') return { ok: false, code: 'not_allowed' };
  const limit = await consumeRateLimit(db, `helper-contact-reveal:${viewerId}`, { limit: HELPER_CONTACT_REVEALS_PER_DAY, windowSeconds: 24 * 60 * 60 }, now);
  if (!limit.ok) return { ok: false, code: 'rate_limited', retryAt: limit.retryAt.toISOString() };
  const { helper, facts } = found;
  await db.insert(auditLog).values({ id: newId('aud'), at: now.toISOString(), actorId: viewerId, actorRole: 'user', action: 'helper_contact.revealed', targetType: 'user', targetId: helperId, metadata: { shares: facts.shares } });
  return {
    ok: true,
    ...(facts.shares.includes('email') ? { email: helper.email } : {}),
    ...(facts.shares.includes('phone') && helper.phone ? { phone: helper.phone } : {}),
  };
}

/** "Contact details on your profile" on the account page: only someone with a helper profile, and recorded as consent. */
export async function saveContactSharing(db: Db, userId: string, input: { setting?: unknown }, now: Date, env: Record<string, string | undefined> = process.env): Promise<ActionResult> {
  if (!isContactSharingSetting(input?.setting)) return { ok: false, code: 'validation_failed', fieldErrors: { setting: ['invalid'] } };
  const setting = input.setting;
  const [row] = await db
    .select({ contactSharing: users.contactSharing, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt })
    .from(users)
    .innerJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .where(and(eq(users.id, userId), ne(users.status, 'deleted')))
    .limit(1);
  if (!row) return { ok: false, code: 'not_allowed' };
  if (row.contactSharing === setting) return { ok: true, code: 'updated' };
  // A phone that can't be verified here (texts off) can't be shared: never chosen, as the account page no longer offers
  // it (sweep 2026-11-24 A6). Choosing to share less always works.
  if (contactSettingSharesPhone(setting) && !(row.phone && row.phoneVerifiedAt) && !smsAvailable(env)) return { ok: false, code: 'not_allowed' };
  await db.transaction(async (tx) => {
    await tx.update(users).set({ contactSharing: setting, updatedAt: now }).where(eq(users.id, userId));
    await tx.insert(auditLog).values({ id: newId('aud'), at: now.toISOString(), actorId: userId, actorRole: 'user', action: 'account.contact_sharing_changed', targetType: 'user', targetId: userId, metadata: { from: row.contactSharing, to: setting } });
  });
  return { ok: true, code: 'updated' };
}
