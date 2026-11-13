import { and, eq, gte, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { supportCaseEvents, supportCaseReads, supportCases } from '@/modules/support/schema';
import { getReportPage, reportTarget } from '@/modules/support/target-reports';
import { createDb } from '@/platform/db/connect';

/** Reports from pages (B-059): Lee reports Maya's desk, Sam's profile and Maya's review of Sam. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
/** A member made for the limit test, so no other file's reports are affected. */
const REPORTER = 'usr_report_limit';
const started = new Date();
afterAll(async () => {
  // Lee's reports from this file go too: left open, they'd count against Maya's and Sam's standing in later
  // files (two reports in 30 days ask a client to verify their ID).
  const lees = await db.select({ id: supportCases.id }).from(supportCases).where(and(eq(supportCases.openedByUserId, 'usr_lee'), gte(supportCases.createdAt, started)));
  const mine = [...lees.map((row) => row.id), ...(await db.select({ id: supportCases.id }).from(supportCases).where(eq(supportCases.openedByUserId, REPORTER))).map((row) => row.id)];
  if (mine.length > 0) {
    await db.delete(supportCaseReads).where(inArray(supportCaseReads.caseId, mine));
    await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, mine));
    await db.delete(supportCases).where(inArray(supportCases.id, mine));
  }
  await db.delete(users).where(eq(users.id, REPORTER));
  await pool.end();
});

const details = 'Asks helpers to pay a deposit by gift card first.';

describe('reports from pages', () => {
  it('shows what is reported and where to go back, and never one of your own', async () => {
    expect(await getReportPage(db, 'usr_lee', 'task', 'tsk_desk')).toMatchObject({ target: { kind: 'task', id: 'tsk_desk', name: 'Assemble a desk (flat-pack, 1 item)' }, backHref: routes.publicTask('assemble-a-desk-mueller-7f3k') });
    expect(await getReportPage(db, 'usr_lee', 'helper', 'sam-k')).toMatchObject({ target: { kind: 'helper', id: 'sam-k', name: 'Sam K.' }, backHref: routes.helperProfile('sam-k') });
    expect(await getReportPage(db, 'usr_lee', 'review', 'rev_seed_1')).toMatchObject({ target: { kind: 'review', name: 'Maya R.' }, backHref: routes.helperProfile('sam-k') });
    expect(await getReportPage(db, 'usr_maya', 'task', 'tsk_desk')).toBeNull();
    expect(await getReportPage(db, 'usr_sam', 'helper', 'sam-k')).toBeNull();
    expect(await getReportPage(db, 'usr_maya', 'review', 'rev_seed_1')).toBeNull();
    expect(await getReportPage(db, 'usr_lee', 'booking', 'bkg_tv')).toBeNull();
    expect(await getReportPage(db, 'usr_lee', 'task', 'tsk_nope')).toBeNull();
  });

  it('opens a case with the target attached: content for tasks and reviews, the person for profiles', async () => {
    expect(await reportTarget(db, 'usr_lee', 'task', 'tsk_desk', { reason: 'scam_or_fraud', details: 'Short' }, new Date())).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await reportTarget(db, 'usr_lee', 'task', 'tsk_desk', { reason: 'scam_or_fraud', details }, new Date())).toEqual({ ok: true, code: 'submitted' });
    expect(await reportTarget(db, 'usr_lee', 'helper', 'sam-k', { reason: 'other', details: 'The profile photo is someone else entirely.' }, new Date())).toEqual({ ok: true, code: 'submitted' });
    expect(await reportTarget(db, 'usr_lee', 'review', 'rev_seed_1', { reason: 'inappropriate_content', details: 'The review shares private details.' }, new Date())).toEqual({ ok: true, code: 'submitted' });
    expect(await reportTarget(db, 'usr_maya', 'task', 'tsk_desk', { reason: 'other', details }, new Date())).toEqual({ ok: false, code: 'not_found' });

    const cases = await db.select().from(supportCases).where(eq(supportCases.openedByUserId, 'usr_lee'));
    expect(cases.find((row) => row.context?.taskId === 'tsk_desk')).toMatchObject({ type: 'report_content', priority: 'high', subjectUserId: 'usr_maya', reason: 'scam_or_fraud', description: details });
    expect(cases.find((row) => row.type === 'report_user' && row.subjectUserId === 'usr_sam')).toMatchObject({ priority: 'normal', reason: 'other' });
    expect(cases.find((row) => row.context?.reviewId === 'rev_seed_1')).toMatchObject({ type: 'report_content', subjectUserId: 'usr_maya' });
  });

  it('shares the daily report limit', async () => {
    const [ruth] = await db.select().from(users).where(eq(users.id, 'usr_ruth'));
    await db.insert(users).values({ ...ruth!, id: REPORTER, email: 'report-limit@example.test', phone: null, phoneVerifiedAt: null });
    let last: Awaited<ReturnType<typeof reportTarget>> = { ok: true, code: 'submitted' };
    for (let n = 0; n < 12 && last.ok; n++) last = await reportTarget(db, REPORTER, 'helper', 'lee-m', { reason: 'other', details: `Report number ${n} about the profile.` }, new Date());
    expect(last).toMatchObject({ ok: false, code: 'rate_limited' });
    expect((await db.select().from(supportCases).where(and(eq(supportCases.openedByUserId, REPORTER), eq(supportCases.type, 'report_user')))).length).toBeLessThanOrEqual(10);
  });
});
