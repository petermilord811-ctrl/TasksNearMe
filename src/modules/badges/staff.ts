import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { BADGE_TIERS, badgeModerationInputSchema, type ActionResult, type AdminBadgeRow, type BadgeCode, type BadgeModerationInput, type CategorySlug, type StaffRole } from '@/contracts';
import { helperProfiles } from '@/modules/profiles/schema';
import type { StaffActor } from '@/modules/support/staff';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { badgeRank } from './domain';
import { userBadges } from './schema';
import { recomputeBadges } from './service';

/**
 * Staff and badges (completion plan 6.4): trust and safety, support leads and admins revoke a badge earned
 * unfairly (a helper and a friend trading bookings, say) or restore it. Both are audited with the reason; a
 * revoked badge is hidden everywhere and left out of recomputing until it's restored.
 */

const MODERATORS: readonly StaffRole[] = ['trust_safety', 'support_lead', 'admin'];
export const canModerateBadges = (roles: readonly StaffRole[]) => roles.some((role) => MODERATORS.includes(role));

/** Every badge the person has reached (shown and revoked), most notable first. */
export async function adminBadgesFor(db: Db, userId: string): Promise<AdminBadgeRow[]> {
  const [rows, [profile]] = await Promise.all([
    db.select().from(userBadges).where(eq(userBadges.userId, userId)),
    db.select({ foundingNumber: helperProfiles.foundingNumber }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1),
  ]);
  return rows
    .filter((row) => row.tier > 0)
    .map((row): AdminBadgeRow => {
      const code = row.code as BadgeCode;
      return {
        id: row.id,
        badge: {
          code,
          tier: row.tier,
          tierCount: BADGE_TIERS[code].length,
          threshold: BADGE_TIERS[code][row.tier - 1] ?? 0,
          ...(code === 'category_pro' && row.scope ? { category: row.scope as CategorySlug } : {}),
          ...(code === 'founding_helper' && profile?.foundingNumber ? { foundingNumber: profile.foundingNumber } : {}),
          earnedAt: row.tierEarnedAt.toISOString(),
        },
        ...(row.revokedAt ? { revoked: { at: row.revokedAt.toISOString(), reason: row.revokedReason ?? '' } } : {}),
      };
    })
    .sort((a, b) => Number(!!a.revoked) - Number(!!b.revoked) || badgeRank(b.badge) - badgeRank(a.badge));
}

export async function moderateBadge(db: Db, staff: StaffActor, input: BadgeModerationInput, now: Date): Promise<ActionResult> {
  const parsed = badgeModerationInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!canModerateBadges(staff.roles)) return { ok: false, code: 'not_allowed' };
  const { badgeId, revoke, reason } = parsed.data;
  const [row] = await db
    .update(userBadges)
    .set(revoke ? { revokedAt: now, revokedByUserId: staff.id, revokedReason: reason, updatedAt: now } : { revokedAt: null, revokedByUserId: null, revokedReason: null, updatedAt: now })
    .where(and(eq(userBadges.id, badgeId), revoke ? isNull(userBadges.revokedAt) : isNotNull(userBadges.revokedAt)))
    .returning({ userId: userBadges.userId, code: userBadges.code, scope: userBadges.scope, tier: userBadges.tier });
  if (!row) return { ok: false, code: 'not_allowed' };
  await db.insert(auditLog).values({
    id: newId('aud'),
    at: now.toISOString(),
    actorId: staff.id,
    actorRole: staff.roles[0] ?? 'staff',
    action: revoke ? 'badge.revoked' : 'badge.restored',
    targetType: 'user',
    targetId: row.userId,
    reason,
    metadata: { badgeId, badge: row.code, scope: row.scope, tier: row.tier },
  });
  // A restored badge catches up with the bookings since, quietly.
  if (!revoke) await recomputeBadges(db, row.userId, now, { announce: false });
  return { ok: true, code: 'updated' };
}
