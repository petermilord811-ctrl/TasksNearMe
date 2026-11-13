import { gte, inArray, or } from 'drizzle-orm';
import { ADMIN_QUEUES, type AdminResponseTimesData, type StaffSummary } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { supportCases } from './schema';
import { caseStatusOf } from './service';
import { caseRowsFor, staffById } from './staff';
import { queueOf, queueResponseStats, RESOLUTION_HOURS, STATUS_FILTERS } from './staff-domain';

/**
 * `/admin/response-times` (completion plan P2): each queue against its targets now and over the last
 * 7 days, the cases past due or due within the hour, and who has the waiting cases.
 */

const HOUR_MS = 3_600_000;
const LIST_LIMIT = 50;

export async function getResponseTimes(db: Db, now: Date): Promise<AdminResponseTimesData> {
  const active = STATUS_FILTERS.active!;
  const rows = await db
    .select()
    .from(supportCases)
    .where(or(inArray(supportCases.status, active), gte(supportCases.createdAt, new Date(now.getTime() - 7 * 24 * HOUR_MS))));
  const facts = rows.map((row) => ({ row, queue: queueOf(row.type), status: caseStatusOf(row.status), createdAt: row.createdAt, firstResponseAt: row.firstResponseAt }));
  const waiting = facts.filter((item) => active.includes(item.status));

  const caseRows = await caseRowsFor(db, waiting.map((item) => item.row), now);
  const dueTime = (due?: string) => (due ? Date.parse(due) : Number.POSITIVE_INFINITY);
  const pastDue = caseRows.filter((row) => row.slaBreached).sort((a, b) => dueTime(a.slaDueAt) - dueTime(b.slaDueAt));
  const dueSoon = caseRows
    .filter((row) => !row.slaBreached && row.slaDueAt && dueTime(row.slaDueAt) - now.getTime() <= HOUR_MS)
    .sort((a, b) => dueTime(a.slaDueAt) - dueTime(b.slaDueAt));

  // Who has the waiting cases (unassigned first, then the most past due).
  const assignees = await staffById(db, waiting.flatMap((item) => (item.row.assigneeUserId ? [item.row.assigneeUserId] : [])));
  const groups = new Map<string, { staff?: StaffSummary; waiting: number; pastDue: number }>();
  for (const row of caseRows) {
    const key = row.assignee?.id ?? '';
    const group = groups.get(key) ?? { ...(row.assignee ? { staff: assignees.get(row.assignee.id) ?? row.assignee } : {}), waiting: 0, pastDue: 0 };
    group.waiting += 1;
    if (row.slaBreached) group.pastDue += 1;
    groups.set(key, group);
  }
  const byAssignee = [...groups.values()].sort((a, b) => (a.staff ? 1 : 0) - (b.staff ? 1 : 0) || b.pastDue - a.pastDue || b.waiting - a.waiting);

  return {
    resolutionHours: RESOLUTION_HOURS,
    queues: ADMIN_QUEUES.map((queue) => queueResponseStats(queue, facts, now)),
    pastDue: pastDue.slice(0, LIST_LIMIT),
    dueSoon: dueSoon.slice(0, LIST_LIMIT),
    byAssignee,
  };
}
