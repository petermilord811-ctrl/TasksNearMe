import { and, desc, eq, ilike, inArray, notInArray, or } from 'drizzle-orm';
import type { ActionResult, AdminDeliveryRow, AdminHelperStatus, AdminUserPageData, AdminUserRow, AdminUsersPageData, BookingStatus, DeliveryStatus, HelperSuspensionInput, NotificationChannel, NotificationType, StaffRole } from '@/contracts';
import { helperSuspensionInputSchema } from '@/contracts';
import { bookingTerms, bookings, helperStrikes } from '@/modules/bookings/schema';
import { notificationDeliveries, notifications } from '@/modules/notifications/schema';
import { offers } from '@/modules/offers/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { rewardGrants } from '@/modules/rewards/schema';
import { getAdminRewardRows } from '@/modules/rewards/staff';
import { supportCases } from '@/modules/support/schema';
import { caseRowsFor, personSummaryOf, type StaffActor } from '@/modules/support/staff';
import { tasks } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { staffRoles, users } from './schema';

/**
 * People for staff (UI-020; B-053, B-056): search, a person's bookings, cases, rewards and strikes, and
 * suspending or reinstating a helper. A suspension withdraws the helper's active offers and hides them from
 * search (the `suspended` profile status); both are audited with the reason.
 */

type UserRow = typeof users.$inferSelect;
const MODERATORS: readonly StaffRole[] = ['trust_safety', 'support_lead', 'admin'];
const FINISHED_CASES = ['resolved', 'closed'];

async function rowsOf(db: Db, people: UserRow[]): Promise<AdminUserRow[]> {
  if (people.length === 0) return [];
  const ids = people.map((user) => user.id);
  const [roles, profiles, cases, strikes] = await Promise.all([
    db.select().from(staffRoles).where(inArray(staffRoles.userId, ids)),
    db.select({ userId: helperProfiles.userId, status: helperProfiles.status }).from(helperProfiles).where(inArray(helperProfiles.userId, ids)),
    db.select({ openedBy: supportCases.openedByUserId }).from(supportCases).where(and(inArray(supportCases.openedByUserId, ids), notInArray(supportCases.status, FINISHED_CASES))),
    db.select({ helperUserId: helperStrikes.helperUserId }).from(helperStrikes).where(inArray(helperStrikes.helperUserId, ids)),
  ]);
  return people.map((user) => ({
    id: user.id,
    person: personSummaryOf(user),
    email: user.email,
    roles: roles.filter((role) => role.userId === user.id).map((role) => role.role as StaffRole),
    helperStatus: (profiles.find((profile) => profile.userId === user.id)?.status as AdminHelperStatus | undefined) ?? 'none',
    openCases: cases.filter((item) => item.openedBy === user.id).length,
    strikes: strikes.filter((item) => item.helperUserId === user.id).length,
  }));
}

/** `routes.admin.users(query)`: name or email contains the query, newest members first (up to 50). */
export async function getAdminUsers(db: Db, query: string): Promise<AdminUsersPageData> {
  const q = query.trim().slice(0, 80);
  const where = q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined;
  const found = await db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(51);
  return { query: q, rows: await rowsOf(db, found.slice(0, 50)), totalCount: found.length };
}

const canModerate = (staff: StaffActor) => staff.roles.some((role) => MODERATORS.includes(role));

/** The latest suspension, if it hasn't been lifted since. */
async function suspensionOf(db: Db, userId: string) {
  const [latest] = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.targetType, 'user'), eq(auditLog.targetId, userId), inArray(auditLog.action, ['helper.suspend', 'helper.reinstate'])))
    .orderBy(desc(auditLog.at))
    .limit(1);
  if (!latest || latest.action !== 'helper.suspend') return undefined;
  const [by] = latest.actorId ? await db.select({ name: users.name }).from(users).where(eq(users.id, latest.actorId)).limit(1) : [];
  return { reason: latest.reason ?? '', at: new Date(latest.at).toISOString(), byDisplayName: by?.name ?? 'Staff' };
}

/** `routes.admin.user(userId)`. */
export async function getAdminUser(db: Db, staff: StaffActor, userId: string, now: Date): Promise<AdminUserPageData | null> {
  const [user] = await db.select().from(users).where(eq(users.id, String(userId))).limit(1);
  if (!user) return null;
  const [[row], bookingRows, caseRows, grants, strikeRows, suspension, deliveryRows] = await Promise.all([
    rowsOf(db, [user]),
    db
      .select({ booking: bookings, title: tasks.title, breakdown: bookingTerms.breakdown })
      .from(bookings)
      .innerJoin(tasks, eq(tasks.id, bookings.taskId))
      .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
      .where(or(eq(bookings.posterUserId, user.id), eq(bookings.helperUserId, user.id)))
      .orderBy(desc(bookings.startAt))
      .limit(20),
    db.select().from(supportCases).where(eq(supportCases.openedByUserId, user.id)).orderBy(desc(supportCases.updatedAt)).limit(20),
    db.select().from(rewardGrants).where(eq(rewardGrants.helperUserId, user.id)).orderBy(desc(rewardGrants.createdAt)).limit(20),
    db.select().from(helperStrikes).where(eq(helperStrikes.helperUserId, user.id)).orderBy(desc(helperStrikes.createdAt)),
    suspensionOf(db, user.id),
    db
      .select({ delivery: notificationDeliveries, type: notifications.type })
      .from(notificationDeliveries)
      .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
      .where(eq(notificationDeliveries.userId, user.id))
      .orderBy(desc(notificationDeliveries.updatedAt))
      .limit(20),
  ]);
  if (!row) return null;
  const actions: AdminUserPageData['actions'] = [];
  if (canModerate(staff) && (row.helperStatus === 'active' || row.helperStatus === 'paused')) actions.push('suspend_helper');
  if (canModerate(staff) && row.helperStatus === 'suspended') actions.push('reinstate_helper');
  return {
    user: { ...row, ...(user.phone ? { phone: { last4: user.phone.slice(-4), verified: user.phoneVerifiedAt !== null } } : {}) },
    bookings: bookingRows.map(({ booking, title, breakdown }) => {
      const role = booking.posterUserId === user.id ? ('poster' as const) : ('helper' as const);
      return { id: booking.id, title, role, status: booking.status as BookingStatus, start: booking.startAt.toISOString(), amountCents: role === 'poster' ? breakdown.posterTotalCents : breakdown.helperEarningsCents };
    }),
    cases: await caseRowsFor(db, caseRows, now),
    rewards: (await getAdminRewardRows(db, { id: staff.id, roles: [] }, grants)).map((reward) => ({ ...reward, actions: [] })),
    strikes: strikeRows.map((strike) => ({ id: strike.id, bookingId: strike.bookingId, reason: strike.reason, at: strike.createdAt.toISOString() })),
    deliveries: deliveryRows.map(({ delivery, type }): AdminDeliveryRow => ({
      id: delivery.id,
      channel: delivery.channel as NotificationChannel,
      type: type as NotificationType,
      status: delivery.status as DeliveryStatus,
      ...(delivery.reason ? { reason: delivery.reason } : {}),
      attempts: delivery.attempts,
      at: (delivery.sentAt ?? delivery.updatedAt).toISOString(),
      ...(delivery.sendAfter && (delivery.status === 'held' || delivery.status === 'failed') ? { nextTryAt: delivery.sendAfter.toISOString() } : {}),
    })),
    ...(suspension && row.helperStatus === 'suspended' ? { suspension } : {}),
    actions,
  };
}

/** Suspends (active offers withdrawn, hidden from search) or reinstates a helper, with the reason in the audit log. */
export async function setHelperSuspension(db: Db, staff: StaffActor, userId: string, input: HelperSuspensionInput, now: Date): Promise<ActionResult> {
  const parsed = helperSuspensionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!canModerate(staff)) return { ok: false, code: 'not_allowed' };
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, String(userId))).limit(1);
  if (!profile) return { ok: false, code: 'not_allowed' };
  const suspend = parsed.data.suspend;
  if (suspend ? !['active', 'paused'].includes(profile.status) : profile.status !== 'suspended') return { ok: false, code: 'not_allowed' };
  await db.transaction(async (tx) => {
    await tx.update(helperProfiles).set({ status: suspend ? 'suspended' : 'active', updatedAt: now.toISOString() }).where(eq(helperProfiles.userId, profile.userId));
    if (suspend) {
      const withdrawn = await tx
        .update(offers)
        .set({ status: 'withdrawn', closedAt: now, updatedAt: now })
        .where(and(eq(offers.helperUserId, profile.userId), inArray(offers.status, ['pending', 'stale'])))
        .returning({ id: offers.id, taskId: offers.taskId });
      for (const offer of withdrawn) {
        await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'offer.withdrawn', aggregateType: 'offer', aggregateId: offer.id, payload: { offerId: offer.id, taskId: offer.taskId, reason: 'helper_suspended' } });
      }
    }
    await tx.insert(auditLog).values({
      id: newId('aud'),
      at: now.toISOString(),
      actorId: staff.id,
      actorRole: staff.roles[0] ?? 'staff',
      action: suspend ? 'helper.suspend' : 'helper.reinstate',
      targetType: 'user',
      targetId: profile.userId,
      reason: parsed.data.reason,
      metadata: {},
    });
  });
  return { ok: true, code: 'updated' };
}
