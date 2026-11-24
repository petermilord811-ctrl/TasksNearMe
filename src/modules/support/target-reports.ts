import { and, eq } from 'drizzle-orm';
import type { ActionResult, ReportInput, ReportPageData, ReportReason, ReportTargetKind } from '@/contracts';
import { REPORT_TARGET_KINDS, reportInputSchema, routes } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { hideAfterReports } from '@/modules/community/moderation';
import { communityPosts, communityReplies } from '@/modules/community/schema';
import { taskQuestions } from '@/modules/questions/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { reviews } from '@/modules/reviews/schema';
import { tasks } from '@/modules/tasks/schema';
import { thankYouNotes } from '@/modules/thanks/schema';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { supportCases } from './schema';
import { markCaseRead } from './service';

/**
 * Reports from pages (backlog B-059): a task, a helper's profile, a review, a community post or reply, or a task
 * question or its answer becomes a support case with the target attached (`report_content`, or `report_user` for
 * profiles), about the person who wrote it. Nobody reports their own; reports share the conversation reports' limit
 * (10 a day).
 */

const REPORT_RULE = { limit: 10, windowSeconds: 24 * 60 * 60 };
const HIGH_PRIORITY: ReadonlySet<ReportReason> = new Set(['harassment', 'scam_or_fraud', 'off_platform_payment', 'unsafe_behavior', 'discrimination']);

interface Target {
  page: ReportPageData;
  subjectUserId: string;
  context: { taskId?: string; reviewId?: string; postId?: string; replyId?: string; questionId?: string; answer?: boolean; thanksId?: string };
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
  if (target === 'question') {
    const [question] = await db
      .select({ id: taskQuestions.id, taskId: taskQuestions.taskId, askerUserId: taskQuestions.askerUserId, status: taskQuestions.status, asker: users.name, posterUserId: tasks.posterUserId })
      .from(taskQuestions)
      .innerJoin(users, eq(users.id, taskQuestions.askerUserId))
      .innerJoin(tasks, eq(tasks.id, taskQuestions.taskId))
      .where(eq(taskQuestions.id, id))
      .limit(1);
    if (!question || question.status !== 'visible' || question.askerUserId === userId) return null;
    const back = question.posterUserId === userId ? routes.app.task(question.taskId) : routes.app.findWorkTask(question.taskId);
    return { page: { target: { kind: target, id: question.id, name: question.asker }, backHref: back }, subjectUserId: question.askerUserId, context: { taskId: question.taskId, questionId: question.id } };
  }
  if (target === 'answer') {
    // The poster's answer to a question, by the question's id: the case is about the poster who wrote it, and the
    // helper who asked can report it too (sweep QA3). Never one's own answer.
    const [question] = await db
      .select({ id: taskQuestions.id, taskId: taskQuestions.taskId, status: taskQuestions.status, answerBody: taskQuestions.answerBody, posterUserId: tasks.posterUserId, poster: users.name })
      .from(taskQuestions)
      .innerJoin(tasks, eq(tasks.id, taskQuestions.taskId))
      .innerJoin(users, eq(users.id, tasks.posterUserId))
      .where(eq(taskQuestions.id, id))
      .limit(1);
    if (!question || question.status !== 'visible' || !question.answerBody || question.posterUserId === userId) return null;
    return { page: { target: { kind: target, id: question.id, name: question.poster }, backHref: routes.app.findWorkTask(question.taskId) }, subjectUserId: question.posterUserId, context: { taskId: question.taskId, questionId: question.id, answer: true } };
  }
  if (target === 'thanks') {
    // A thank-you note (2026-11-24): its helper can report it, and anyone who reads it on the helper's profile. Never its
    // author, and not once our team hid it. Named by the helper it was written to (its author may have hidden their name).
    const [note] = await db
      .select({ id: thankYouNotes.id, bookingId: thankYouNotes.bookingId, authorUserId: thankYouNotes.authorUserId, helperUserId: thankYouNotes.helperUserId, shown: thankYouNotes.shownOnProfile, hiddenAt: thankYouNotes.hiddenAt, helper: users.name, handle: helperProfiles.handle })
      .from(thankYouNotes)
      .innerJoin(users, eq(users.id, thankYouNotes.helperUserId))
      .leftJoin(helperProfiles, eq(helperProfiles.userId, thankYouNotes.helperUserId))
      .where(eq(thankYouNotes.id, id))
      .limit(1);
    if (!note || note.hiddenAt || note.authorUserId === userId) return null;
    const isHelper = note.helperUserId === userId;
    if (!isHelper && !note.shown) return null;
    const back = isHelper || !note.handle ? routes.app.booking(note.bookingId) : routes.helperProfile(note.handle);
    return { page: { target: { kind: target, id: note.id, name: note.helper }, backHref: back }, subjectUserId: note.authorUserId, context: { thanksId: note.id } };
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
  // Enough reports from established accounts hide a Neighbors post or reply until staff look (plan 10.21).
  if (found.page.target.kind === 'post' || found.page.target.kind === 'reply') await hideAfterReports(db, found.page.target.kind, found.page.target.id, now);
  return { ok: true, code: 'submitted' };
}
