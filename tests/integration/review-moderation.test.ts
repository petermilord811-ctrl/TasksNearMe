import { and, eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { helperProfiles } from '@/modules/profiles/schema';
import { getHelperProfile } from '@/modules/profiles/queries';
import { reviews } from '@/modules/reviews/schema';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import type { StaffActor } from '@/modules/support/staff';
import { getAdminCase, moderateReportedReview } from '@/modules/support/staff';
import { reportTarget } from '@/modules/support/target-reports';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { throwawayClient } from '../support/people';

/**
 * A review report's case shows the review, and support leads, trust and safety and admins hide it per
 * policy (blueprint 08): it leaves the profile and the rating, the reason is audited and noted on the case,
 * and it can be shown again. Ruth's review of Lee (seeded) is restored at the end.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const taylor: StaffActor = { id: 'usr_taylor', roles: ['trust_safety'] };
const REVIEW = 'rev_seed_5';
const reason = 'Comments on the person, not the work: community guidelines.';

const ratingOfLee = async () => (await db.select({ count: helperProfiles.ratingCount, average: helperProfiles.ratingAverage }).from(helperProfiles).where(eq(helperProfiles.userId, 'usr_lee')))[0];

describe('a reported review on its case', () => {
  it('shows the review, lets a lead hide it and trust and safety show it again, and keeps an agent out', async () => {
    const reporter = await throwawayClient(db, 'usr_revmod_reporter');
    expect(await reportTarget(db, reporter, 'review', REVIEW, { reason: 'harassment', details: 'This review is about the person, not the work they did.' }, new Date())).toEqual({ ok: true, code: 'submitted' });
    const [found] = await db
      .select({ id: supportCases.id })
      .from(supportCases)
      .where(and(eq(supportCases.openedByUserId, reporter), sql`${supportCases.context}->>'reviewId' = ${REVIEW}`));
    const caseId = found!.id;
    const before = await ratingOfLee();
    expect(before?.count).toBeGreaterThan(0);

    // Everyone on staff sees it; only some can change it.
    const forAgent = await getAdminCase(db, alex, caseId, new Date());
    expect(forAgent?.data.review).toMatchObject({ status: 'published', canModerate: false, subject: { displayName: 'Lee M.' }, review: { id: REVIEW, rating: 5, author: { displayName: 'Ruth A.' } } });
    expect(await moderateReportedReview(db, alex, caseId, { visible: false, reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getAdminCase(db, morgan, caseId, new Date()))?.data.review?.canModerate).toBe(true);

    // A reason is required.
    expect(await moderateReportedReview(db, morgan, caseId, { visible: false, reason: 'short' }, new Date())).toMatchObject({ ok: false, code: 'validation_failed' });

    // Hidden: off the profile and out of the rating; audited and on the case.
    expect(await moderateReportedReview(db, morgan, caseId, { visible: false, reason }, new Date())).toEqual({ ok: true, code: 'updated', helperHandle: 'lee-m' });
    expect((await db.select().from(reviews).where(eq(reviews.id, REVIEW)))[0]).toMatchObject({ status: 'hidden', hiddenReason: reason });
    expect(await ratingOfLee()).toEqual({ count: before!.count - 1, average: before!.count - 1 === 0 ? null : expect.any(Number) });
    expect((await getHelperProfile('lee-m', db))?.reviews.map((review) => review.id)).not.toContain(REVIEW);
    const page = await getAdminCase(db, alex, caseId, new Date());
    expect(page?.data.review).toMatchObject({ status: 'hidden', hiddenReason: reason });
    expect(page?.data.events.find((event) => event.kind === 'review')).toMatchObject({ reviewAction: 'hidden', body: reason, actor: { kind: 'staff' } });
    // Hiding twice changes nothing.
    expect(await moderateReportedReview(db, morgan, caseId, { visible: false, reason }, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await db.select().from(supportCaseEvents).where(and(eq(supportCaseEvents.caseId, caseId), eq(supportCaseEvents.kind, 'note')))).toHaveLength(1);

    // Shown again: back on the profile and in the rating.
    expect(await moderateReportedReview(db, taylor, caseId, { visible: true, reason: 'Appeal accepted: the review is about the work after all.' }, new Date())).toMatchObject({ ok: true, code: 'updated' });
    expect((await db.select().from(reviews).where(eq(reviews.id, REVIEW)))[0]).toMatchObject({ status: 'published', hiddenReason: null });
    expect(await ratingOfLee()).toEqual(before);
    expect((await getHelperProfile('lee-m', db))?.reviews.map((review) => review.id)).toContain(REVIEW);

    const actions = (await db.select({ action: auditLog.action, actor: auditLog.actorId }).from(auditLog).where(eq(auditLog.targetId, REVIEW))).map((row) => `${row.action}:${row.actor}`);
    expect(actions).toEqual(expect.arrayContaining(['review.hidden:usr_morgan', 'review.shown:usr_taylor']));
  });

  it("is only for cases about a review", async () => {
    const [other] = await db.select({ id: supportCases.id }).from(supportCases).where(sql`${supportCases.context}->>'reviewId' is null`).limit(1);
    expect(await moderateReportedReview(db, morgan, other!.id, { visible: false, reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getAdminCase(db, morgan, other!.id, new Date()))?.data.review).toBeUndefined();
  });
});
