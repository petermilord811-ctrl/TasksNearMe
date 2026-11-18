import { and, asc, desc, eq, inArray, notInArray, type SQL } from 'drizzle-orm';
import type {
  ActionResult,
  AdminCaseEventView,
  AdminCaseFilters,
  AdminCasePageData,
  AdminCaseParty,
  AdminCaseReview,
  AdminCaseRow,
  AdminCasesPageData,
  AdminConversationView,
  AdminHomeData,
  AdminQueue,
  BookingStatus,
  CasePriority,
  CaseResolution,
  CaseResolutionInput,
  CaseStatus,
  CaseStatusInput,
  CaseType,
  PersonSummary,
  Photo,
  ResolutionPreviewResult,
  RestrictedAccessInput,
  ReviewModerationInput,
  RevealConversationResult,
  StaffEmailContactInput,
  StaffNoteInput,
  StaffReplyInput,
  StaffRole,
  StaffSummary,
} from '@/contracts';
import {
  ADMIN_CASE_STATUS_FILTERS,
  ADMIN_QUEUES,
  CASE_PRIORITIES,
  CASE_TYPES,
  caseResolutionInputSchema,
  caseStatusInputSchema,
  restrictedAccessInputSchema,
  reviewModerationInputSchema,
  HELPER_REVIEW_TAGS,
  localeOrDefault,
  staffEmailContactInputSchema,
  staffNoteInputSchema,
  staffReplyInputSchema,
} from '@/contracts';
import type { EmailProvider } from '@/integrations/email';
import { staffRoles, users } from '@/modules/accounts/schema';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { payments, refunds } from '@/modules/payments/schema';
import { bookingCompletions, bookingTerms, bookings } from '@/modules/bookings/schema';
import { photoFromFile } from '@/modules/files/uploads';
import { messages, threadParticipants, threads } from '@/modules/messaging/schema';
import { initialsOf } from '@/modules/profiles/queries';
import { helperProfiles } from '@/modules/profiles/schema';
import { recomputeRating } from '@/modules/reviews/service';
import { reviews } from '@/modules/reviews/schema';
import { categories } from '@/modules/markets/schema';
import { files, tasks } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit, consumeRateLimits } from '@/platform/rate-limit';
import { renderSupportEmailReply } from './emails';
import { caseLabelsOf, caseStatusOf } from './service';
import { supportCaseEvents, supportCases } from './schema';
import {
  QUEUE_TYPES,
  STATUS_FILTERS,
  MONEY_RESOLUTIONS,
  caseResolutions,
  isFinishedStatus,
  nextCaseStatuses,
  queueOf,
  slaDueAt,
  refundLimitOf,
  canModerateReviews,
  fillReplyPlaceholders,
  resolutionMoney,
  staffCaseActions,
  type BookingMoneyFacts,
  type StaffCaseFacts,
} from './staff-domain';

/**
 * Staff working support cases (UI-018; blueprint 03 §9, B-052, B-054): the queues, the case list, a
 * case with its people, booking and timeline; replies to each person, notes, assignment, status,
 * resolution (no money yet), and the reported conversation behind a logged reason. Every change is
 * written to the audit log, and changes that move the case check its version.
 */

export interface StaffActor {
  id: string;
  roles: StaffRole[];
}

/** A staff member who passed the two-step check, or null. */
export function staffActorOf(user: { id: string; staffRoles: StaffRole[]; staffTwoStepVerified: boolean }): StaffActor | null {
  return user.staffRoles.length > 0 && user.staffTwoStepVerified ? { id: user.id, roles: user.staffRoles } : null;
}

type CaseRow = typeof supportCases.$inferSelect;
type UserRow = typeof users.$inferSelect;
type EventRow = typeof supportCaseEvents.$inferSelect;

const REPLY_RULE = { limit: 60, windowSeconds: 10 * 60 };
/** Emails to one public request's address (5.22), on top of the staff member's own reply limit. */
export const EMAIL_CONTACT_RULE = { limit: 10, windowSeconds: 24 * 60 * 60 };

export function personSummaryOf(user: UserRow): PersonSummary {
  return {
    id: user.id,
    displayName: user.name,
    initials: initialsOf(user.firstName, user.lastName),
    memberSince: user.createdAt.toISOString(),
    phoneVerified: user.phoneVerifiedAt !== null,
  };
}

async function usersById(db: Db, ids: string[]): Promise<Map<string, UserRow>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(users).where(inArray(users.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Staff summaries (name, initials, roles) by user id. */
export async function staffById(db: Db, ids: string[]): Promise<Map<string, StaffSummary>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const [people, roles] = await Promise.all([
    db.select().from(users).where(inArray(users.id, unique)),
    db.select().from(staffRoles).where(inArray(staffRoles.userId, unique)),
  ]);
  return new Map(
    people.map((user) => [
      user.id,
      {
        id: user.id,
        displayName: user.name,
        initials: initialsOf(user.firstName, user.lastName),
        roles: roles.filter((role) => role.userId === user.id).map((role) => role.role as StaffRole),
      },
    ]),
  );
}

const typeOf = (value: string): CaseType => ((CASE_TYPES as readonly string[]).includes(value) ? (value as CaseType) : 'request');
const priorityOf = (value: string): CasePriority => ((CASE_PRIORITIES as readonly string[]).includes(value) ? (value as CasePriority) : 'normal');

/** A member's message to support, or a public request's address writing again: not staff's. */
const fromCaseMember = (event: Pick<EventRow, 'authorUserId' | 'partyUserId' | 'meta'>) =>
  event.meta?.fromContact === true || (event.authorUserId !== null && event.authorUserId === event.partyUserId);

/** Members wrote after the last staff message (or staff haven't written yet). */
function awaitingReplyOf(row: CaseRow, events: Pick<EventRow, 'kind' | 'authorUserId' | 'partyUserId' | 'meta' | 'createdAt'>[]): boolean {
  if (isFinishedStatus(caseStatusOf(row.status))) return false;
  let lastMember = row.createdAt;
  let lastStaff: Date | null = null;
  for (const event of events) {
    if (event.kind !== 'message') continue;
    const fromMember = fromCaseMember(event);
    if (fromMember && event.createdAt > lastMember) lastMember = event.createdAt;
    if (!fromMember && (!lastStaff || event.createdAt > lastStaff)) lastStaff = event.createdAt;
  }
  return !lastStaff || lastMember > lastStaff;
}

/** Case rows as the lists show them. */
export async function caseRowsFor(db: Db, rows: CaseRow[], now: Date): Promise<AdminCaseRow[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [labels, openers, assignees, messageEvents] = await Promise.all([
    caseLabelsOf(db, rows),
    usersById(db, rows.flatMap((row) => (row.openedByUserId ? [row.openedByUserId] : []))),
    staffById(db, rows.flatMap((row) => (row.assigneeUserId ? [row.assigneeUserId] : []))),
    db
      .select({ caseId: supportCaseEvents.caseId, kind: supportCaseEvents.kind, authorUserId: supportCaseEvents.authorUserId, partyUserId: supportCaseEvents.partyUserId, meta: supportCaseEvents.meta, createdAt: supportCaseEvents.createdAt })
      .from(supportCaseEvents)
      .where(and(inArray(supportCaseEvents.caseId, ids), eq(supportCaseEvents.kind, 'message'))),
  ]);
  return rows.flatMap((row) => {
    const opener = row.openedByUserId ? openers.get(row.openedByUserId) : undefined;
    // A public request (5.22) has its address instead of a member.
    if (!opener && !row.contactEmail) return [];
    const status = caseStatusOf(row.status);
    const queue = queueOf(row.type);
    const due = slaDueAt({ queue, status, createdAt: row.createdAt, firstResponseAt: row.firstResponseAt });
    const assignee = row.assigneeUserId ? assignees.get(row.assigneeUserId) : undefined;
    return [
      {
        id: row.id,
        type: typeOf(row.type),
        queue,
        status,
        priority: priorityOf(row.priority),
        subject: labels.get(row.id)?.subject ?? 'Support',
        ...(opener ? { openedBy: personSummaryOf(opener) } : row.contactEmail ? { contact: { email: row.contactEmail } } : {}),
        openedAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        ...(due ? { slaDueAt: due.toISOString() } : {}),
        slaBreached: Boolean(due && due < now),
        ...(assignee ? { assignee } : {}),
        awaitingReply: awaitingReplyOf(row, messageEvents.filter((event) => event.caseId === row.id)),
      },
    ];
  });
}

/** Cases that wait on staff: what the queue cards count and link to (`active`). */
const ACTIVE_STATUSES = STATUS_FILTERS.active!;

/** `/admin`: the queues and the viewer's open cases. */
/** Without `verifications`: the page adds those (src/modules/verification/staff.ts). */
export async function getAdminHome(db: Db, staff: StaffActor, now: Date): Promise<Omit<AdminHomeData, 'verifications'>> {
  const open = await db.select().from(supportCases).where(inArray(supportCases.status, ACTIVE_STATUSES));
  const me = (await staffById(db, [staff.id])).get(staff.id);
  return {
    staff: me ?? { id: staff.id, displayName: 'Staff', initials: 'ST', roles: staff.roles },
    queues: ADMIN_QUEUES.map((queue) => {
      const inQueue = open.filter((row) => queueOf(row.type) === queue);
      const oldest = inQueue.reduce<Date | null>((min, row) => (!min || row.createdAt < min ? row.createdAt : min), null);
      const breaches = inQueue.filter((row) => {
        const due = slaDueAt({ queue, status: caseStatusOf(row.status), createdAt: row.createdAt, firstResponseAt: row.firstResponseAt });
        return Boolean(due && due < now);
      }).length;
      const urgent = inQueue.filter((row) => row.priority === 'urgent').length;
      return { queue, openCount: inQueue.length, slaBreaches: breaches, urgentCount: urgent, ...(oldest ? { oldestOpenedAt: oldest.toISOString() } : {}) };
    }),
    myOpenCount: open.filter((row) => row.assigneeUserId === staff.id).length,
  };
}

/** Filters from the URL (unknown values fall back to the defaults: every queue, active cases). */
export function parseAdminCaseFilters(params: Record<string, string | string[] | undefined>): AdminCaseFilters {
  const one = (key: string) => (Array.isArray(params[key]) ? params[key]![0] : params[key]) as string | undefined;
  const queue = one('queue');
  const status = one('status');
  return {
    ...((ADMIN_QUEUES as readonly string[]).includes(queue ?? '') ? { queue: queue as AdminQueue } : {}),
    status: (ADMIN_CASE_STATUS_FILTERS as readonly string[]).includes(status ?? '') ? (status as AdminCaseFilters['status']) : 'active',
    mine: one('mine') === '1',
  };
}

/** `/admin/cases`: response due soonest first; cases without a target after, newest first. Up to 100. */
export async function getAdminCases(db: Db, staff: StaffActor, filters: AdminCaseFilters, now: Date): Promise<AdminCasesPageData> {
  const conditions: SQL[] = [];
  // Requests take every type the other queues don't (as `queueOf` does).
  if (filters.queue === 'requests') conditions.push(notInArray(supportCases.type, [...QUEUE_TYPES.disputes, ...QUEUE_TYPES.safety, ...QUEUE_TYPES.reports]));
  else if (filters.queue) conditions.push(inArray(supportCases.type, QUEUE_TYPES[filters.queue]));
  const statuses = STATUS_FILTERS[filters.status];
  if (statuses) conditions.push(inArray(supportCases.status, statuses));
  if (filters.mine) conditions.push(eq(supportCases.assigneeUserId, staff.id));
  const found = await db
    .select()
    .from(supportCases)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supportCases.updatedAt))
    .limit(500);
  const rows = await caseRowsFor(db, found, now);
  rows.sort((a, b) => {
    if (a.slaDueAt && b.slaDueAt) return a.slaDueAt.localeCompare(b.slaDueAt);
    if (a.slaDueAt) return -1;
    if (b.slaDueAt) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return { filters, cases: rows.slice(0, 100), totalCount: rows.length };
}

// ---- One case -----------------------------------------------------------------------------------------

interface CaseContext {
  row: CaseRow;
  parties: AdminCaseParty[];
  facts: StaffCaseFacts;
  booking?: { id: string; taskId: string; title: string; status: string; startAt: Date; termsVersion: number; posterUserId: string; helperUserId: string };
}

async function loadCase(db: Db, staff: StaffActor, caseId: string): Promise<CaseContext | null> {
  const [row] = await db.select().from(supportCases).where(eq(supportCases.id, String(caseId))).limit(1);
  if (!row) return null;
  const [booking] = row.bookingId
    ? await db
        .select({ id: bookings.id, taskId: bookings.taskId, title: tasks.title, status: bookings.status, startAt: bookings.startAt, termsVersion: bookings.termsVersion, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId })
        .from(bookings)
        .innerJoin(tasks, eq(tasks.id, bookings.taskId))
        .where(eq(bookings.id, row.bookingId))
        .limit(1)
    : [];
  const [people, paidRows] = await Promise.all([
    usersById(db, [...(row.openedByUserId ? [row.openedByUserId] : []), ...(row.subjectUserId ? [row.subjectUserId] : []), ...(booking ? [booking.posterUserId, booking.helperUserId] : [])]),
    booking
      ? db.select({ id: payments.id }).from(payments).where(and(eq(payments.bookingId, booking.id), inArray(payments.status, ['succeeded', 'partially_refunded', 'refunded']))).limit(1)
      : Promise.resolve([]),
  ]);
  const sideOf = (userId: string): 'poster' | 'helper' | undefined => (booking?.posterUserId === userId ? 'poster' : booking?.helperUserId === userId ? 'helper' : undefined);

  const parties: AdminCaseParty[] = [];
  const opener = row.openedByUserId ? people.get(row.openedByUserId) : undefined;
  if (opener) parties.push({ person: personSummaryOf(opener), role: sideOf(opener.id) ?? 'opener', canMessage: true });
  const reported = row.subjectUserId ? people.get(row.subjectUserId) : undefined;
  if (reported) parties.push({ person: personSummaryOf(reported), role: 'reported', canMessage: false });
  if (booking) {
    for (const id of [booking.posterUserId, booking.helperUserId]) {
      const person = people.get(id);
      if (!person || parties.some((party) => party.person.id === id)) continue;
      parties.push({ person: personSummaryOf(person), role: sideOf(id)!, canMessage: true });
    }
  }
  // Waiting on someone: by their side of the booking; without a booking, by how the opener uses the app. A
  // public request's address is neither (staff answer it and resolve; writing again adds to the case).
  const messageable = parties.filter((party) => party.canMessage);
  const waitingOn = booking
    ? { poster: messageable.some((party) => party.role === 'poster'), helper: messageable.some((party) => party.role === 'helper') }
    : opener
      ? { poster: opener.mode !== 'helper', helper: opener.mode === 'helper' }
      : { poster: false, helper: false };
  return {
    row,
    parties,
    facts: {
      roles: staff.roles,
      viewerId: staff.id,
      type: row.type,
      status: caseStatusOf(row.status),
      assigneeId: row.assigneeUserId,
      waitingOn,
      ...(booking ? { booking: { status: booking.status, paid: paidRows.length > 0 } } : {}),
    },
    ...(booking ? { booking } : {}),
  };
}

function photosOf(ids: string[], photoOf: Map<string, Photo>): { photos?: Photo[] } {
  const list = ids.flatMap((id) => photoOf.get(id) ?? []);
  return list.length > 0 ? { photos: list } : {};
}

/** `/admin/cases/[caseId]`, with the version the page's actions are bound to. */
export async function getAdminCase(db: Db, staff: StaffActor, caseId: string, now: Date): Promise<{ data: AdminCasePageData; version: number } | null> {
  const ctx = await loadCase(db, staff, caseId);
  if (!ctx) return null;
  const { row, facts } = ctx;
  const events = await db.select().from(supportCaseEvents).where(eq(supportCaseEvents.caseId, row.id)).orderBy(asc(supportCaseEvents.createdAt));
  const [[summary], staffPeople, members, terms] = await Promise.all([
    caseRowsFor(db, [row], now),
    staffById(db, [
      ...events.flatMap((event) => (event.authorUserId && event.authorUserId !== event.partyUserId ? [event.authorUserId] : [])),
      ...events.flatMap((event) => (event.meta?.assigneeUserId ? [event.meta.assigneeUserId] : [])),
    ]),
    usersById(db, events.flatMap((event) => (event.authorUserId && event.authorUserId === event.partyUserId ? [event.authorUserId] : []))),
    ctx.booking
      ? db.select({ breakdown: bookingTerms.breakdown }).from(bookingTerms).where(and(eq(bookingTerms.bookingId, ctx.booking.id), eq(bookingTerms.version, ctx.booking.termsVersion))).limit(1)
      : Promise.resolve([]),
  ]);
  if (!summary) return null;
  // A report's conversation is named after its task.
  const [contextTask] = row.context?.threadId
    ? await db.select({ title: tasks.title }).from(threads).innerJoin(tasks, eq(tasks.id, threads.taskId)).where(eq(threads.id, row.context.threadId)).limit(1)
    : [];
  const contextTitle = row.context?.threadId ? (contextTask?.title ?? summary.subject) : undefined;
  const fileIds = [...new Set([...row.fileIds, ...events.flatMap((event) => event.fileIds)])];
  const fileRows = fileIds.length > 0 ? await db.select().from(files).where(inArray(files.id, fileIds)) : [];
  const photoOf = new Map(fileRows.map((file) => [file.id, photoFromFile(file)]));
  const money = ctx.booking ? await bookingMoneyFacts(db, ctx.booking.id) : null;
  const reportedReview = row.context?.reviewId ? await reportedReviewOf(db, staff, row.context.reviewId) : null;

  const timeline = events.flatMap((event): AdminCaseEventView[] => {
    const at = event.createdAt.toISOString();
    const staffActor = event.authorUserId ? staffPeople.get(event.authorUserId) : undefined;
    const actor: AdminCaseEventView['actor'] = staffActor ? { kind: 'staff', staff: staffActor } : { kind: 'system' };
    switch (event.kind) {
      case 'message': {
        const member = event.authorUserId && event.authorUserId === event.partyUserId ? members.get(event.authorUserId) : undefined;
        const contact = event.meta?.fromContact && row.contactEmail ? row.contactEmail : undefined;
        return [
          {
            id: event.id,
            kind: 'message',
            actor: member ? { kind: 'member', person: personSummaryOf(member) } : contact ? { kind: 'contact', email: contact } : actor,
            ...(event.partyUserId ? { partyId: event.partyUserId } : {}),
            ...(event.meta?.emailed ? { emailed: true } : {}),
            body: event.body ?? '',
            ...photosOf(event.fileIds, photoOf),
            at,
          },
        ];
      }
      case 'note':
        return event.meta?.reviewAction
          ? [{ id: event.id, kind: 'review', actor, reviewAction: event.meta.reviewAction, body: event.body ?? '', at }]
          : [{ id: event.id, kind: 'note', actor, body: event.body ?? '', at }];
      case 'status':
        return [{ id: event.id, kind: 'status', actor, status: caseStatusOf(event.status), at }];
      case 'assignment': {
        const assignee = event.meta?.assigneeUserId ? staffPeople.get(event.meta.assigneeUserId) : undefined;
        return [{ id: event.id, kind: 'assignment', actor, ...(assignee ? { assignee } : {}), at }];
      }
      case 'resolution':
        return event.meta?.resolution ? [{ id: event.id, kind: 'resolution', actor, resolution: event.meta.resolution as CaseResolution, at }] : [];
      default:
        return [];
    }
  });

  const data: AdminCasePageData = {
    case: {
      ...summary,
      description: row.description,
      photos: photosOf(row.fileIds, photoOf).photos ?? [],
      ...(row.reason ? { reason: row.reason } : {}),
      ...(row.resolution && row.resolvedAt
        ? { resolution: { type: row.resolution as CaseResolution, summary: row.resolutionSummary ?? '', at: row.resolvedAt.toISOString() } }
        : {}),
    },
    parties: ctx.parties,
    ...((ctx.booking?.taskId ?? row.context?.taskId) ? { taskId: ctx.booking?.taskId ?? row.context?.taskId } : {}),
    ...(ctx.booking
      ? {
          booking: {
            id: ctx.booking.id,
            title: ctx.booking.title,
            status: ctx.booking.status as BookingStatus,
            start: ctx.booking.startAt.toISOString(),
            priceCents: terms[0]?.breakdown.taskPriceCents ?? 0,
          },
        }
      : {}),
    events: timeline,
    ...(contextTitle !== undefined ? { context: { kind: 'conversation' as const, title: contextTitle } } : {}),
    ...(reportedReview ? { review: reportedReview } : {}),
    actions: staffCaseActions(facts),
    nextStatuses: nextCaseStatuses(facts),
    resolutions: caseResolutions(facts),
    ...(money ? { money: { priceCents: money.priceCents, chargedCents: money.chargedCents, refundedCents: money.refundedCents } } : {}),
    ...(row.contactEmail ? { contact: await contactOf(db, row) } : {}),
  };
  return { data, version: row.version };
}

/**
 * A public request's address, its language, and the account that uses it, if any. The match is for staff
 * only and proves nothing about who wrote: the form doesn't check the address (5.22).
 */
async function contactOf(db: Db, row: CaseRow): Promise<NonNullable<AdminCasePageData['contact']>> {
  const email = row.contactEmail ?? '';
  const [account] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email)).limit(1);
  return { email, locale: localeOrDefault(row.contactLocale), ...(account ? { matchesAccount: { id: account.id, displayName: account.name } } : {}) };
}

// ---- A reported review (blueprint 08: hidden per policy by leads and trust & safety, audited) ----------

const HELPER_TAGS = new Set<string>(HELPER_REVIEW_TAGS);

/** The review a report points at, as staff see it on the case. */
async function reportedReviewOf(db: Db, staff: StaffActor, reviewId: string): Promise<AdminCaseReview | null> {
  const [row] = await db
    .select({ review: reviews, slug: categories.slug })
    .from(reviews)
    .innerJoin(categories, eq(categories.id, reviews.categoryId))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!row) return null;
  const people = await usersById(db, [row.review.authorUserId, row.review.subjectUserId]);
  const author = people.get(row.review.authorUserId);
  const subject = people.get(row.review.subjectUserId);
  const status = row.review.status === 'hidden' ? 'hidden' : row.review.status === 'published' ? 'published' : 'submitted';
  return {
    review: {
      id: row.review.id,
      rating: Math.min(5, Math.max(1, row.review.rating)) as 1 | 2 | 3 | 4 | 5,
      tags: row.review.tags.filter((tag) => HELPER_TAGS.has(tag)) as AdminCaseReview['review']['tags'],
      ...(row.review.body ? { body: row.review.body } : {}),
      author: { displayName: author?.name ?? '', initials: author ? initialsOf(author.firstName, author.lastName) : '' },
      categorySlug: row.slug as AdminCaseReview['review']['categorySlug'],
      publishedAt: (row.review.publishedAt ?? row.review.createdAt).toISOString(),
    },
    subject: { displayName: subject?.name ?? '' },
    status,
    ...(status === 'hidden' && row.review.hiddenReason ? { hiddenReason: row.review.hiddenReason } : {}),
    canModerate: canModerateReviews(staff.roles),
  };
}

/**
 * Hides the case's reported review (off the profile and out of the helper's rating), or shows it again. The
 * reason goes in the audit log and, as an internal note, on the case. Returns the helper's handle when their
 * public profile changed, so the caller can refresh its cache.
 */
export async function moderateReportedReview(
  db: Db,
  staff: StaffActor,
  caseId: string,
  input: ReviewModerationInput,
  now: Date,
): Promise<ActionResult & { helperHandle?: string }> {
  const parsed = reviewModerationInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const ctx = await loadCase(db, staff, caseId);
  const reviewId = ctx?.row.context?.reviewId;
  if (!ctx || !reviewId || !canModerateReviews(staff.roles)) return { ok: false, code: 'not_allowed' };
  const { visible, reason } = parsed.data;

  return db.transaction(async (tx) => {
    const [review] = await tx.select().from(reviews).where(eq(reviews.id, reviewId)).for('update');
    if (!review) return { ok: false, code: 'not_found' } as const;
    const hidden = review.status === 'hidden';
    if (visible !== hidden) return { ok: true, code: 'updated' } as const;
    await tx
      .update(reviews)
      .set(visible ? { status: review.publishedAt ? 'published' : 'submitted', hiddenReason: null } : { status: 'hidden', hiddenReason: reason })
      .where(eq(reviews.id, review.id));
    await tx.insert(supportCaseEvents).values({ id: newId('cev'), caseId: ctx.row.id, kind: 'note', authorUserId: staff.id, visibility: 'internal', body: reason, meta: { reviewAction: visible ? 'shown' : 'hidden' }, createdAt: now });
    await audit(tx, staff, visible ? 'review.shown' : 'review.hidden', ctx.row.id, now, { reason, targetType: 'review', targetId: review.id });
    if (review.direction !== 'client_to_helper') return { ok: true, code: 'updated' } as const;
    await recomputeRating(tx, review.subjectUserId);
    const [profile] = await tx.select({ handle: helperProfiles.handle }).from(helperProfiles).where(eq(helperProfiles.userId, review.subjectUserId)).limit(1);
    return { ok: true, code: 'updated', ...(profile?.handle ? { helperHandle: profile.handle } : {}) } as const;
  });
}

/** A booking's price, what was charged and refunded, and the market's fees (null without a paid booking). */
/**
 * What staff have chosen to refund on this booking so far (goodwill, fraud and dispute settlements, pending or
 * done). Blueprint 08's refund limits are per booking, so each new refund counts on top of these: five $100
 * goodwill refunds are a $500 decision, not five $100 ones.
 */
export async function discretionaryRefundedCents(db: Db, bookingId: string): Promise<number> {
  const rows = await db
    .select({ amountCents: refunds.amountCents })
    .from(refunds)
    .where(and(eq(refunds.bookingId, bookingId), inArray(refunds.reason, ['goodwill', 'fraud', 'dispute_settlement']), inArray(refunds.status, ['pending', 'succeeded'])));
  return rows.reduce((sum, row) => sum + row.amountCents, 0);
}

export async function bookingMoneyFacts(db: Db, bookingId: string): Promise<BookingMoneyFacts | null> {
  const [row] = await db
    .select({ termsVersion: bookings.termsVersion, marketId: tasks.marketId })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  const [[terms], [completion], paid, refunded, policy] = await Promise.all([
    db.select({ breakdown: bookingTerms.breakdown }).from(bookingTerms).where(and(eq(bookingTerms.bookingId, bookingId), eq(bookingTerms.version, row.termsVersion))).limit(1),
    db.select({ final: bookingCompletions.finalBreakdown }).from(bookingCompletions).where(eq(bookingCompletions.bookingId, bookingId)).limit(1),
    // A client's tip is the helper's (UI-057): not part of what staff refund or settle.
    db
      .select({ amountCents: payments.amountCents })
      .from(payments)
      .where(and(eq(payments.bookingId, bookingId), notInArray(payments.purpose, ['tip']), inArray(payments.status, ['succeeded', 'partially_refunded', 'refunded']))),
    db.select({ amountCents: refunds.amountCents }).from(refunds).where(and(eq(refunds.bookingId, bookingId), inArray(refunds.status, ['pending', 'succeeded']))),
    getPublishedPolicy(row.marketId, db),
  ]);
  const chargedCents = paid.reduce((sum, item) => sum + item.amountCents, 0);
  if (!terms || !policy || chargedCents === 0) return null;
  // Once the work is submitted, a settlement is measured from the submitted price, not the agreed one (an hourly cap):
  // the submitted numbers already give back the unused hours, so counting from the cap gave them back twice (money
  // review #3). Settled: the client pays P' plus its fee (and approved expenses); the rest comes back.
  return { fees: policy.fees, priceCents: completion?.final.taskPriceCents ?? terms.breakdown.taskPriceCents, chargedCents, refundedCents: refunded.reduce((sum, item) => sum + item.amountCents, 0) };
}

/** The money a resolution would move on this case's booking, and whether it is within the viewer's refund limit. */
export async function previewResolution(db: Db, staff: StaffActor, caseId: string, input: CaseResolutionInput): Promise<ResolutionPreviewResult> {
  const parsed = caseResolutionInputSchema.safeParse(input);
  // validationFailed always returns the failure shape.
  if (!parsed.success) return validationFailed(parsed.error) as Extract<ActionResult, { ok: false }>;
  const ctx = await loadCase(db, staff, caseId);
  if (!ctx?.booking || !caseResolutions(ctx.facts).includes(parsed.data.resolution)) return { ok: false, code: 'not_allowed' };
  const money = await bookingMoneyFacts(db, ctx.booking.id);
  if (!money) return { ok: false, code: 'not_allowed' };
  const moved = resolutionMoney(parsed.data.resolution, money, parsed.data);
  if (moved === null) return { ok: false, code: 'validation_failed', fieldErrors: { resolution: ['invalid'] } };
  if (moved === 'out_of_range') {
    return { ok: false, code: 'validation_failed', fieldErrors: { [parsed.data.resolution === 'settle' ? 'settlePriceCents' : 'goodwillCents']: ['invalid'] } };
  }
  // The limit is per booking: earlier discretionary refunds count too.
  const prior = moved.posterRefundCents > 0 ? await discretionaryRefundedCents(db, ctx.booking.id) : 0;
  return { ok: true, preview: { ...moved, withinLimit: moved.posterRefundCents === 0 || prior + moved.posterRefundCents <= refundLimitOf(staff.roles) } };
}

// ---- Commands ---------------------------------------------------------------------------------------

async function audit(db: Pick<Db, 'insert'>, staff: StaffActor, action: string, caseId: string, now: Date, extra: { reason?: string; metadata?: Record<string, unknown>; targetType?: string; targetId?: string } = {}) {
  await db.insert(auditLog).values({
    id: newId('aud'),
    at: now.toISOString(),
    actorId: staff.id,
    actorRole: staff.roles[0] ?? 'staff',
    action,
    targetType: extra.targetType ?? 'support_case',
    targetId: extra.targetId ?? caseId,
    ...(extra.reason ? { reason: extra.reason } : {}),
    metadata: { caseId, ...extra.metadata },
  });
}

/** Moves the case if nobody changed it since the page loaded (`version`). */
async function moveCase(
  db: Db,
  staff: StaffActor,
  ctx: CaseContext,
  version: number,
  now: Date,
  change: { set: Partial<typeof supportCases.$inferInsert>; events: (typeof supportCaseEvents.$inferInsert)[]; action: string; metadata?: Record<string, unknown> },
): Promise<ActionResult | null> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(supportCases)
      .set({ ...change.set, version: ctx.row.version + 1, updatedAt: now })
      .where(and(eq(supportCases.id, ctx.row.id), eq(supportCases.version, Number(version))))
      .returning({ id: supportCases.id });
    if (updated.length === 0) return { ok: false, code: 'version_conflict' } satisfies ActionResult;
    if (change.events.length > 0) await tx.insert(supportCaseEvents).values(change.events);
    await audit(tx, staff, change.action, ctx.row.id, now, change.metadata ? { metadata: change.metadata } : {});
    return null;
  });
}

const statusEvent = (caseId: string, staffId: string, status: CaseStatus, at: Date) => ({ id: newId('cev'), caseId, kind: 'status', authorUserId: staffId, status, createdAt: at });

export async function assignCase(db: Db, staff: StaffActor, caseId: string, version: number, assign: boolean, now: Date): Promise<ActionResult> {
  const ctx = await loadCase(db, staff, caseId);
  if (!ctx) return { ok: false, code: 'not_allowed' };
  const allowed = staffCaseActions(ctx.facts);
  if (!allowed.includes(assign ? 'assign_to_me' : 'unassign')) return { ok: false, code: 'not_allowed' };
  const assigneeUserId = assign ? staff.id : null;
  const failed = await moveCase(db, staff, ctx, version, now, {
    set: { assigneeUserId },
    events: [{ id: newId('cev'), caseId: ctx.row.id, kind: 'assignment', authorUserId: staff.id, visibility: 'internal', meta: { assigneeUserId }, createdAt: now }],
    action: assign ? 'case.assign' : 'case.unassign',
  });
  return failed ?? { ok: true, code: 'updated' };
}

export async function setCaseStatus(db: Db, staff: StaffActor, caseId: string, version: number, input: CaseStatusInput, now: Date): Promise<ActionResult> {
  const parsed = caseStatusInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const ctx = await loadCase(db, staff, caseId);
  if (!ctx || !nextCaseStatuses(ctx.facts).includes(parsed.data.status)) return { ok: false, code: 'not_allowed' };
  const failed = await moveCase(db, staff, ctx, version, now, {
    set: { status: parsed.data.status },
    events: [statusEvent(ctx.row.id, staff.id, parsed.data.status, now)],
    action: 'case.set_status',
    metadata: { from: ctx.row.status, to: parsed.data.status },
  });
  return failed ?? { ok: true, code: 'updated' };
}

/** Staff write to one person on the case; only they (and staff) see it. */
export async function staffReply(db: Db, staff: StaffActor, caseId: string, input: StaffReplyInput, now: Date): Promise<ActionResult> {
  const parsed = staffReplyInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const ctx = await loadCase(db, staff, caseId);
  if (!ctx || !staffCaseActions(ctx.facts).includes('reply')) return { ok: false, code: 'not_allowed' };
  if (!ctx.parties.some((party) => party.canMessage && party.person.id === parsed.data.partyId)) {
    return { ok: false, code: 'validation_failed', fieldErrors: { partyId: ['invalid'] } };
  }
  const limited = await consumeRateLimit(db, `staff-reply:${staff.id}`, REPLY_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const subject = (await caseLabelsOf(db, [ctx.row])).get(ctx.row.id)?.subject ?? 'Support';
  // A saved reply's (or a typed) `{first_name}` and `{staff_name}` become the real names.
  const names = await usersById(db, [parsed.data.partyId, staff.id]);
  const body = fillReplyPlaceholders(parsed.data.body, { first_name: names.get(parsed.data.partyId)?.firstName ?? '', staff_name: names.get(staff.id)?.firstName ?? '' });
  await db.transaction(async (tx) => {
    await tx.insert(supportCaseEvents).values({ id: newId('cev'), caseId: ctx.row.id, kind: 'message', authorUserId: staff.id, partyUserId: parsed.data.partyId, body, createdAt: now });
    await tx
      .update(supportCases)
      .set({ updatedAt: now, ...(ctx.row.firstResponseAt ? {} : { firstResponseAt: now }) })
      .where(eq(supportCases.id, ctx.row.id));
    await audit(tx, staff, 'case.reply', ctx.row.id, now, { metadata: { to: parsed.data.partyId } });
    await tx.insert(outboxEvents).values({
      id: newId('evt'),
      type: 'support.replied',
      aggregateType: 'support_case',
      aggregateId: ctx.row.id,
      payload: { caseId: ctx.row.id, partyUserId: parsed.data.partyId, subject },
    });
  });
  return { ok: true, code: 'sent' };
}

export interface ContactMailer {
  email: EmailProvider;
  appUrl: string;
}

/**
 * Staff answer a public request (5.22) by email, in the address's language, signed with their first name.
 * Limited per staff member and per case, and audited. The email goes first: a send that fails records
 * nothing, so staff can try again. Nobody can sign in to read it, so it's a message with no party.
 */
export async function staffEmailContact(db: Db, mailer: ContactMailer, staff: StaffActor, caseId: string, input: StaffEmailContactInput, now: Date): Promise<ActionResult> {
  const parsed = staffEmailContactInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const ctx = await loadCase(db, staff, caseId);
  const to = ctx?.row.contactEmail;
  if (!ctx || !to || !staffCaseActions(ctx.facts).includes('reply')) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimits(
    db,
    [
      { key: `staff-reply:${staff.id}`, rule: REPLY_RULE },
      { key: `staff-email:${ctx.row.id}`, rule: EMAIL_CONTACT_RULE },
    ],
    now,
  );
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const staffName = (await usersById(db, [staff.id])).get(staff.id)?.firstName ?? '';
  // Nobody's first name is known for an address: a saved reply's greeting drops it.
  const body = fillReplyPlaceholders(parsed.data.body, { first_name: '', staff_name: staffName })
    .replace(/[ \t]+([,.!?])/g, '$1')
    .trim();
  const eventId = newId('cev');
  const rendered = renderSupportEmailReply({ body, staffName, appUrl: mailer.appUrl, locale: localeOrDefault(ctx.row.contactLocale) });
  try {
    await mailer.email.send({ to, subject: rendered.subject, text: rendered.text, html: rendered.html, tag: 'support-reply', idempotencyKey: eventId });
  } catch (error) {
    console.error('[support-reply]', error);
    return { ok: false, code: 'unknown' };
  }
  await db.transaction(async (tx) => {
    await tx.insert(supportCaseEvents).values({ id: eventId, caseId: ctx.row.id, kind: 'message', authorUserId: staff.id, body, meta: { emailed: true }, createdAt: now });
    await tx
      .update(supportCases)
      .set({ updatedAt: now, ...(ctx.row.firstResponseAt ? {} : { firstResponseAt: now }) })
      .where(eq(supportCases.id, ctx.row.id));
    await audit(tx, staff, 'case.email_contact', ctx.row.id, now, { metadata: { eventId } });
  });
  return { ok: true, code: 'sent' };
}

/** A note only staff see. */
export async function addCaseNote(db: Db, staff: StaffActor, caseId: string, input: StaffNoteInput, now: Date): Promise<ActionResult> {
  const parsed = staffNoteInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const ctx = await loadCase(db, staff, caseId);
  if (!ctx) return { ok: false, code: 'not_allowed' };
  await db.insert(supportCaseEvents).values({ id: newId('cev'), caseId: ctx.row.id, kind: 'note', authorUserId: staff.id, visibility: 'internal', body: parsed.data.body, createdAt: now });
  return { ok: true, code: 'saved' };
}

/** Resolve without money effects: the summary goes to everyone staff can write to on the case. */
export async function resolveCase(
  db: Db,
  staff: StaffActor,
  caseId: string,
  version: number,
  input: CaseResolutionInput,
  now: Date,
  options: { moneyApplied?: boolean } = {},
): Promise<ActionResult> {
  const parsed = caseResolutionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const ctx = await loadCase(db, staff, caseId);
  if (!ctx) return { ok: false, code: 'not_allowed' };
  // Money resolutions go through resolveCaseWithMoney (staff-money.ts): it checked the resolution before the
  // money moved (which changes the booking, and so what's offered), so only the right to resolve is left.
  if (MONEY_RESOLUTIONS.includes(parsed.data.resolution) && !options.moneyApplied) return { ok: false, code: 'not_allowed' };
  const allowed = options.moneyApplied ? staffCaseActions(ctx.facts).includes('resolve') : caseResolutions(ctx.facts).includes(parsed.data.resolution);
  if (!allowed) return { ok: false, code: 'not_allowed' };
  const later = (ms: number) => new Date(now.getTime() + ms);
  const failed = await moveCase(db, staff, ctx, version, now, {
    set: {
      status: 'resolved',
      resolution: parsed.data.resolution,
      resolutionSummary: parsed.data.summary,
      resolvedAt: now,
      ...(ctx.row.firstResponseAt ? {} : { firstResponseAt: now }),
    },
    events: [
      { id: newId('cev'), caseId: ctx.row.id, kind: 'resolution', authorUserId: staff.id, visibility: 'internal', meta: { resolution: parsed.data.resolution }, createdAt: now },
      ...ctx.parties
        .filter((party) => party.canMessage)
        .map((party) => ({ id: newId('cev'), caseId: ctx.row.id, kind: 'message', authorUserId: staff.id, partyUserId: party.person.id, body: parsed.data.summary, createdAt: later(1) })),
      statusEvent(ctx.row.id, staff.id, 'resolved', later(2)),
    ],
    action: 'case.resolve',
    metadata: { resolution: parsed.data.resolution },
  });
  if (failed) return failed;
  await db.insert(outboxEvents).values({
    id: newId('evt'),
    type: 'support.resolved',
    aggregateType: 'support_case',
    aggregateId: ctx.row.id,
    payload: {
      caseId: ctx.row.id,
      recipientIds: ctx.parties.filter((party) => party.canMessage).map((party) => party.person.id),
      subject: (await caseLabelsOf(db, [ctx.row])).get(ctx.row.id)?.subject ?? 'Support',
    },
  });
  return { ok: true, code: 'saved' };
}

export async function closeCase(db: Db, staff: StaffActor, caseId: string, version: number, now: Date): Promise<ActionResult> {
  const ctx = await loadCase(db, staff, caseId);
  if (!ctx || !staffCaseActions(ctx.facts).includes('close')) return { ok: false, code: 'not_allowed' };
  const failed = await moveCase(db, staff, ctx, version, now, {
    set: { status: 'closed', closedAt: now },
    events: [statusEvent(ctx.row.id, staff.id, 'closed', now)],
    action: 'case.close',
  });
  return failed ?? { ok: true, code: 'updated' };
}

export async function reopenCase(db: Db, staff: StaffActor, caseId: string, version: number, now: Date): Promise<ActionResult> {
  const ctx = await loadCase(db, staff, caseId);
  if (!ctx || !staffCaseActions(ctx.facts).includes('reopen')) return { ok: false, code: 'not_allowed' };
  const failed = await moveCase(db, staff, ctx, version, now, {
    set: { status: 'awaiting_support', closedAt: null },
    events: [statusEvent(ctx.row.id, staff.id, 'awaiting_support', now)],
    action: 'case.reopen',
  });
  return failed ?? { ok: true, code: 'updated' };
}

/** The reported conversation, as written, after a reason that goes to the audit log with the staff member's name. */
export async function revealCaseConversation(db: Db, staff: StaffActor, caseId: string, input: RestrictedAccessInput, now: Date): Promise<RevealConversationResult> {
  const parsed = restrictedAccessInputSchema.safeParse(input);
  // validationFailed always returns the failure shape.
  if (!parsed.success) return validationFailed(parsed.error) as Extract<ActionResult, { ok: false }>;
  const ctx = await loadCase(db, staff, caseId);
  const threadId = ctx?.row.context?.threadId;
  if (!ctx || !threadId || !staffCaseActions(ctx.facts).includes('reply')) return { ok: false, code: 'not_allowed' };
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
  if (!thread) return { ok: false, code: 'not_allowed' };
  await audit(db, staff, 'case.view_conversation', ctx.row.id, now, { reason: parsed.data.reason, targetType: 'thread', targetId: thread.id });

  return { ok: true, conversation: await conversationView(db, thread) };
}

/** A conversation as written (staff see what was masked for the other person), oldest first. */
export async function conversationView(db: Db, thread: typeof threads.$inferSelect): Promise<AdminConversationView> {
  const [participants, rows, [task]] = await Promise.all([
    db.select({ userId: threadParticipants.userId }).from(threadParticipants).where(eq(threadParticipants.threadId, thread.id)),
    db.select().from(messages).where(eq(messages.threadId, thread.id)).orderBy(asc(messages.createdAt)),
    db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, thread.taskId)).limit(1),
  ]);
  const people = await usersById(db, participants.map((row) => row.userId));
  const fileIds = [...new Set(rows.flatMap((row) => row.attachmentFileIds))];
  const fileRows = fileIds.length > 0 ? await db.select().from(files).where(inArray(files.id, fileIds)) : [];
  const photoOf = new Map(fileRows.map((file) => [file.id, photoFromFile(file)]));
  return {
    title: task?.title ?? 'Conversation',
    people: [...people.values()].map(personSummaryOf),
    messages: rows.map((row) => {
      const sender = row.senderUserId ? people.get(row.senderUserId) : undefined;
      return {
        id: row.id,
        ...(sender ? { sender: personSummaryOf(sender) } : {}),
        kind: row.kind === 'text' ? 'text' : row.kind === 'status' ? 'status' : 'system',
        body: row.body || (row.event ? row.event.type : ''),
        ...photosOf(row.attachmentFileIds, photoOf),
        at: row.createdAt.toISOString(),
      };
    }),
  };
}
