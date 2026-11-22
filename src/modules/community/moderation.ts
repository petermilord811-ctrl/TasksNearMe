import { and, eq, gt, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { supportCases } from '@/modules/support/schema';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { AUTO_HIDE_REPORTS, reportsHide } from './domain';
import { communityPosts, communityReplies } from './schema';

/**
 * Hidden after reports (plan 10.21): once `AUTO_HIDE_REPORTS` different accounts at least a week old have reported a
 * post or a reply since staff last decided on it, it's hidden (as staff hide it: the author and staff still see it,
 * marked) until trust and safety restore or remove it from the case. Its cases go to high priority, the audit log
 * says why, and the author is told. A new account alone can't hide a neighbor's post, and a restored post isn't hidden
 * again by the reports staff already read.
 */
export async function hideAfterReports(db: Db, target: 'post' | 'reply', id: string, now: Date): Promise<boolean> {
  const table = target === 'post' ? communityPosts : communityReplies;
  const [item] = await db.select({ id: table.id, status: table.status, authorUserId: table.authorUserId, moderatedAt: table.moderatedAt }).from(table).where(eq(table.id, id)).limit(1);
  if (!item || item.status !== 'visible') return false;
  const aboutIt = target === 'post'
    ? and(sql`${supportCases.context}->>'postId' = ${id}`, sql`(${supportCases.context}->>'replyId') is null`)
    : sql`${supportCases.context}->>'replyId' = ${id}`;
  const reports = await db
    .select({ caseId: supportCases.id, userId: supportCases.openedByUserId, createdAt: users.createdAt })
    .from(supportCases)
    .innerJoin(users, eq(users.id, supportCases.openedByUserId))
    .where(
      and(
        eq(supportCases.type, 'report_content'),
        notInArray(supportCases.status, ['resolved', 'closed']),
        aboutIt,
        // Only what came in since staff last decided on it.
        item.moderatedAt ? gt(supportCases.createdAt, item.moderatedAt) : undefined,
      ),
    );
  const reporters = reports.flatMap((row) => (row.userId ? [{ userId: row.userId, createdAt: row.createdAt }] : []));
  if (!reportsHide(reporters, now)) return false;
  let postId = id;
  if (target === 'reply') {
    const [reply] = await db.select({ postId: communityReplies.postId }).from(communityReplies).where(eq(communityReplies.id, id)).limit(1);
    postId = reply?.postId ?? id;
  }
  const hidden = await db.transaction(async (tx) => {
    const changed = await tx
      .update(table)
      .set({ status: 'hidden', moderationReason: 'reports', moderatedByUserId: null, moderatedAt: now, updatedAt: now })
      .where(and(eq(table.id, id), eq(table.status, 'visible')))
      .returning({ id: table.id });
    if (changed.length === 0) return false;
    if (target === 'reply') await tx.update(communityPosts).set({ replyCount: sql`greatest(${communityPosts.replyCount} - 1, 0)` }).where(eq(communityPosts.id, postId));
    await tx.update(supportCases).set({ priority: 'high', updatedAt: now }).where(inArray(supportCases.id, reports.map((row) => row.caseId)));
    await tx.insert(auditLog).values({
      id: newId('aud'),
      actorId: null,
      actorRole: 'system',
      action: `community.${target}.auto_hide`,
      targetType: target === 'post' ? 'community_post' : 'community_reply',
      targetId: id,
      reason: `Reported by ${AUTO_HIDE_REPORTS} or more established accounts`,
      metadata: { reporters: [...new Set(reporters.map((reporter) => reporter.userId))].length, cases: reports.map((row) => row.caseId) },
    });
    await tx
      .insert(outboxEvents)
      .values({ id: `evt_auto_hidden_${id}_${now.getTime()}`, type: 'community.auto_hidden', aggregateType: 'community_post', aggregateId: postId, payload: { postId, targetKind: target, targetId: id, authorUserId: item.authorUserId } })
      .onConflictDoNothing();
    return true;
  });
  return hidden;
}

/** Reports about posts and replies in a period, and how many were hidden automatically (plan 10.22). */
export async function reportCounts(db: Db, from: Date, to: Date): Promise<{ reports: number; autoHidden: number }> {
  const [reports, hidden] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(supportCases)
      .where(and(eq(supportCases.type, 'report_content'), sql`${supportCases.createdAt} >= ${from} and ${supportCases.createdAt} <= ${to}`, or(sql`${supportCases.context}->>'postId' is not null`, sql`${supportCases.context}->>'replyId' is not null`))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(and(inArray(auditLog.action, ['community.post.auto_hide', 'community.reply.auto_hide']), sql`${auditLog.at} >= ${from} and ${auditLog.at} <= ${to}`, isNull(auditLog.actorId))),
  ]);
  return { reports: Number(reports[0]?.n ?? 0), autoHidden: Number(hidden[0]?.n ?? 0) };
}
