import { and, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  ANNOUNCEMENT_MAX_DAYS,
  announcementEndInputSchema,
  announcementInputSchema,
  type ActionResult,
  type AdminAnnouncementRow,
  type AnnouncementEndInput,
  type AnnouncementInput,
  type AppLocale,
  type CommunityAnnouncementView,
} from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { markets } from '@/modules/markets/schema';
import type { StaffActor } from '@/modules/support/staff';
import { auditRoleOf } from '@/modules/tasks/moderation';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import { communityAnnouncementDismissals, communityAnnouncements } from './schema';

/**
 * The card staff pin to the top of a market's Neighbors (plan 10.16): a welcome at launch, a holiday note. One shows at
 * a time per market (the newest that has started and not ended), in the reader's language; a member who closes it
 * never sees it again on any device. Admins publish and end them from the config page, with a reason in the audit log.
 */

type AnnouncementRow = typeof communityAnnouncements.$inferSelect;

const liveNow = (now: Date) => and(lte(communityAnnouncements.startsAt, now), gt(communityAnnouncements.endsAt, now), isNull(communityAnnouncements.endedAt));

/** The market's card for this reader now, unless they closed it. */
export async function announcementFor(db: Db, userId: string, marketId: string, locale: AppLocale, now: Date): Promise<CommunityAnnouncementView | undefined> {
  const [row] = await db
    .select()
    .from(communityAnnouncements)
    .where(and(eq(communityAnnouncements.marketId, marketId), liveNow(now), sql`not exists (select 1 from ${communityAnnouncementDismissals} d where d.announcement_id = ${communityAnnouncements.id} and d.user_id = ${userId})`))
    .orderBy(desc(communityAnnouncements.startsAt))
    .limit(1);
  if (!row) return undefined;
  return { id: row.id, title: locale === 'es' ? row.titleEs : row.titleEn, body: locale === 'es' ? row.bodyEs : row.bodyEn, endsAt: row.endsAt.toISOString() };
}

/** A member closes the card (it may have ended meanwhile: closing still works). */
export async function dismissAnnouncement(db: Db, userId: string, id: string, now: Date): Promise<ActionResult> {
  const [row] = await db.select({ id: communityAnnouncements.id }).from(communityAnnouncements).where(eq(communityAnnouncements.id, String(id))).limit(1);
  if (!row) return { ok: false, code: 'not_found' };
  await db.insert(communityAnnouncementDismissals).values({ userId, announcementId: row.id, createdAt: now }).onConflictDoNothing();
  return { ok: true, code: 'updated' };
}

const stateOf = (row: AnnouncementRow, now: Date): AdminAnnouncementRow['state'] =>
  row.endedAt || row.endsAt.getTime() <= now.getTime() ? 'ended' : row.startsAt.getTime() > now.getTime() ? 'scheduled' : 'live';

/** The config page's list: live and scheduled cards first, then the five that ended last. */
export async function adminAnnouncements(db: Db, now: Date): Promise<AdminAnnouncementRow[]> {
  const rows = await db
    .select({ row: communityAnnouncements, marketName: markets.name, by: users.name })
    .from(communityAnnouncements)
    .innerJoin(markets, eq(markets.id, communityAnnouncements.marketId))
    .innerJoin(users, eq(users.id, communityAnnouncements.createdByUserId))
    .orderBy(desc(communityAnnouncements.createdAt))
    .limit(40);
  const ids = rows.map(({ row }) => row.id);
  const dismissals = ids.length
    ? await db
        .select({ id: communityAnnouncementDismissals.announcementId, n: sql<number>`count(*)::int` })
        .from(communityAnnouncementDismissals)
        .where(inArray(communityAnnouncementDismissals.announcementId, ids))
        .groupBy(communityAnnouncementDismissals.announcementId)
    : [];
  const dismissedBy = new Map(dismissals.map((row) => [row.id, Number(row.n)]));
  const views = rows.map(({ row, marketName, by }): AdminAnnouncementRow => ({
    id: row.id,
    market: { id: row.marketId, name: marketName },
    titleEn: row.titleEn,
    bodyEn: row.bodyEn,
    titleEs: row.titleEs,
    bodyEs: row.bodyEs,
    startsAt: row.startsAt.toISOString(),
    endsAt: (row.endedAt ?? row.endsAt).toISOString(),
    state: stateOf(row, now),
    createdBy: by,
    dismissals: dismissedBy.get(row.id) ?? 0,
  }));
  const open = views.filter((view) => view.state !== 'ended');
  return [...open, ...views.filter((view) => view.state === 'ended').slice(0, 5)];
}

/**
 * An admin pins a card to a market's Neighbors until the end of `endsDate` (the market's day), replacing its live one.
 * Audited with the reason.
 */
export async function publishAnnouncement(db: Db, staff: StaffActor, input: AnnouncementInput, now: Date): Promise<ActionResult> {
  if (!staff.roles.includes('admin')) return { ok: false, code: 'not_allowed' };
  const parsed = announcementInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [market] = await db.select({ id: markets.id, timeZone: markets.timeZone }).from(markets).where(eq(markets.id, parsed.data.marketId)).limit(1);
  if (!market) return { ok: false, code: 'not_found' };
  const today = marketDayKey(now, market.timeZone);
  const lastDay = new Date(Date.parse(`${today}T12:00:00Z`) + ANNOUNCEMENT_MAX_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (parsed.data.endsDate < today || parsed.data.endsDate > lastDay) return { ok: false, code: 'validation_failed', fieldErrors: { endsDate: ['out_of_range'] } };
  // The end of that day on the market's clock: midnight after it.
  const dayAfter = new Date(Date.parse(`${parsed.data.endsDate}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const endsAt = new Date(marketLocalToUtc(dayAfter, '00:00', market.timeZone));
  const id = newId('can');
  await db.transaction(async (tx) => {
    await tx
      .update(communityAnnouncements)
      .set({ endedAt: now })
      .where(and(eq(communityAnnouncements.marketId, market.id), isNull(communityAnnouncements.endedAt), gt(communityAnnouncements.endsAt, now)));
    await tx.insert(communityAnnouncements).values({
      id,
      marketId: market.id,
      titleEn: parsed.data.titleEn,
      bodyEn: parsed.data.bodyEn,
      titleEs: parsed.data.titleEs,
      bodyEs: parsed.data.bodyEs,
      startsAt: now,
      endsAt,
      createdByUserId: staff.id,
      createdAt: now,
    });
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: staff.id, actorRole: auditRoleOf(staff.roles), action: 'community.announcement.publish', targetType: 'community_announcement', targetId: id, reason: parsed.data.reason, metadata: { marketId: market.id, endsAt: endsAt.toISOString() } });
  });
  return { ok: true, code: 'updated' };
}

/** An admin takes a card down now. */
export async function endAnnouncement(db: Db, staff: StaffActor, input: AnnouncementEndInput, now: Date): Promise<ActionResult> {
  if (!staff.roles.includes('admin')) return { ok: false, code: 'not_allowed' };
  const parsed = announcementEndInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [row] = await db.select().from(communityAnnouncements).where(eq(communityAnnouncements.id, parsed.data.id)).limit(1);
  if (!row) return { ok: false, code: 'not_found' };
  if (row.endedAt || row.endsAt.getTime() <= now.getTime()) return { ok: true, code: 'updated' };
  await db.transaction(async (tx) => {
    await tx.update(communityAnnouncements).set({ endedAt: now }).where(eq(communityAnnouncements.id, row.id));
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: staff.id, actorRole: auditRoleOf(staff.roles), action: 'community.announcement.end', targetType: 'community_announcement', targetId: row.id, reason: parsed.data.reason, metadata: { marketId: row.marketId } });
  });
  return { ok: true, code: 'updated' };
}
