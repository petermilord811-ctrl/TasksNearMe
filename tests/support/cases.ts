import { and, eq, inArray } from 'drizzle-orm';
import { supportCaseEvents, supportCaseReads, supportCases } from '@/modules/support/schema';
import type { Db } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Removes support cases a test file opened (reports included), with their events, read marks and outbox events. A report
 * left behind counts against the person it's about in every later file: two in 30 days and poster risk asks a client
 * for an ID check before paying (src/modules/trust/poster-risk.ts), which failed later files in CI.
 */
export async function deleteCases(db: Db, caseIds: string[]): Promise<void> {
  if (caseIds.length === 0) return;
  await db.delete(outboxEvents).where(and(eq(outboxEvents.aggregateType, 'support_case'), inArray(outboxEvents.aggregateId, caseIds)));
  await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, caseIds));
  await db.delete(supportCaseReads).where(inArray(supportCaseReads.caseId, caseIds));
  await db.delete(supportCases).where(inArray(supportCases.id, caseIds));
}

/** The cases opened by these people (a test's reporters). */
export async function casesOpenedBy(db: Db, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  return (await db.select({ id: supportCases.id }).from(supportCases).where(inArray(supportCases.openedByUserId, userIds))).map((row) => row.id);
}
