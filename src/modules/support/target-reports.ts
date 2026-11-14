import { and, eq } from 'drizzle-orm';
import type { ActionResult, ReportInput, ReportPageData, ReportReason, ReportTargetKind } from '@/contracts';
import { REPORT_TARGET_KINDS, reportInputSchema, routes } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { communityPosts, communityReplies } from '@/modules/community/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { reviews } from '@/modules/reviews/schema';
import { tasks } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { supportCases } from './schema';
import { markCaseRead } from './service';

/**
 * Reports from pages (backlog B-059): a task, a helper's profile, or a review becomes a support case with
 * the target attached (`report_content` for tasks and reviews, `report_user` for profiles). Nobody reports
 * their own; reports share the conversation reports' limit (10 a day).
 */

const REPORT_RULE = { limit: 10, windowSeconds: 24 * 60 * 60 };
const HIGH_PRIORITY: ReadonlySet<ReportReason> = new Set(['harassment', 'scam_or_fraud', 'off_platform_payment', 'unsafe_behavior', 'discrimination']);

interface Target {
  page: ReportPageData;
  subjectUserId: string;
  context: { taskId?: string; reviewId?: string; postId?: string; replyId?: string };
}

async function targetOf(db: Db, userId: string, kind: string, id: string): Promise<Target | null> {
  if (!(REPORT_TARGET_KINDS as readonly string[]).includes(kind)) return null;
  const target = kind as ReportTargetKind;
  if (target === 'task') {
    const [task] = await db.select({ id: tasks.id, slug: tasks.slug, title: tasks.title, status: tasks.status, posterUserId: tasks.posterUserId }).from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!task || task.status === 'draft' || task.posterUserId === userId) return null;
    const back = task.status === 'open' ? routes.publicTask(task.slug) : routes.app.findWorkTask(task.id);
    return { page: { target: { kind: target, id: task.id, name: task.title }, backHref: back }, subjectUserId: task.posterUserId, context: { taskId: task.id } };
  }
  if (target === 'helper') {
    const [helper] = await db
      .select({ userId: helperProfiles.userId, handle: helperProfiles.handle, name: users.name })
      .from(helperProfiles)
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .where(eq(helperProfiles.handle, id))
      .limit(1);
    if (!helper || helper.userId === userId) return null;
    return { page: { target: { kind: target, id: helper.handle, name: helper.name }, backHref: routes.helperProfile(helper.handle) }, subjectUserId: helper.userId, context: {} };
  }
  if (target === 'post') {
    const [post] = await db.select({ id: communityPosts.id, title: communityPosts.title, authorUserId: communityPosts.authorUserId, status: communityPosts.status }).from(communityPosts).where(eq(communityPosts.id, id)).limit(1);
    if (!post || post.status !== 'visible' || post.authorUserId === userId) return null;
    return { page: { target: { kind: target, id: post.id, name: post.title }, backHref: routes.app.communityPost(post.id) }, subjectUserId: post.authorUserId, context: { postId: post.id } };
  }
  if (target === 'reply') {
    const [reply] = await db
      .select({ id: communityReplies.id, postId: communityReplies.postId, authorUserId: communityReplies.authorUserId, status: communityReplies.status, author: users.name })
      .from(communityReplies)
      .innerJoin(users, eq(users.id, communityReplies.authorUserId))
      .where(eq(communityReplies.id, id))
      .limit(1);
    if (!reply || reply.status !== 'visible' || reply.authorUserId === userId) return null;
    return { page: { target: { kind: target, id: reply.id, name: reply.author }, backHref: routes.app.communityPost(reply.postId) }, subjectUserId: reply.authorUserId, context: { postId: reply.postId, replyId: reply.id } };
  }
  const [review] = await db
    .select({ id: reviews.id, authorUserId: reviews.authorUserId, subjectUserId: reviews.subjectUserId, author: users.name, handle: helperProfiles.handle })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.authorUserId))
    .leftJoin(helperProfiles, eq(helperProfiles.userId, reviews.subjectUserId))
    .where(and(eq(reviews.id, id), eq(reviews.status, 'published')))
    .limit(1);
  if (!review || review.authorUserId === userId) return null;
  return {
    page: { target: { kind: target, id: review.id, name: review.author }, backHref: review.handle ? routes.helperProfile(review.handle) : routes.app.home() },
    subjectUserId: review.authorUserId,
    context: { reviewId: review.id },
  };
}

/** `routes.app.report(kind, id)`; null when there's nothing the viewer may report. */
export async function getReportPage(db: Db, userId: string, kind: string, id: string): Promise<ReportPageData | null> {
  return (await targetOf(db, userId, String(kind), String(id)))?.page ?? null;
}

export async function reportTarget(db: Db, userId: string, kind: string, id: string, input: ReportInput, now: Date): Promise<ActionResult> {
  const parsed = reportInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const found = await targetOf(db, userId, String(kind), String(id));
  if (!found) return { ok: false, code: 'not_found' };
  const limited = await consumeRateLimit(db, `report:${userId}`, REPORT_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const caseId = newId('case');
  const type = found.page.target.kind === 'helper' ? 'report_user' : 'report_content';
  await db.transaction(async (tx) => {
    await tx.insert(supportCases).values({
      id: caseId,
      type,
      status: 'open',
      priority: HIGH_PRIORITY.has(parsed.data.reason) ? 'high' : 'normal',
      openedByUserId: userId,
      subjectUserId: found.subjectUserId,
      context: found.context,
      reason: parsed.data.reason,
      description: parsed.data.details,
      createdAt: now,
      updatedAt: now,
    });
    await markCaseRead(tx, caseId, userId, now);
    await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'support.case_opened', aggregateType: 'support_case', aggregateId: caseId, payload: { caseId, type, openedByUserId: userId, target: found.page.target.kind } });
  });
  return { ok: true, code: 'submitted' };
}
