import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type {
  ActionResult,
  AssistantHandoff,
  BookingDisputeView,
  CaseEventView,
  CaseResolution,
  ProblemReason,
  CaseStatus,
  HelpCaseView,
  MemberCaseKind,
  NewSupportRequestInput,
  Photo,
  ReportInput,
  ReportReason,
  ReportSubject,
  SupportCasePageData,
  SupportCaseRow,
  SupportPageData,
  SupportReplyInput,
  SupportTopic,
} from '@/contracts';
import { CASE_STATUSES, SUPPORT_TOPICS, newSupportRequestInputSchema, reportInputSchema, routes, supportReplyInputSchema } from '@/contracts';
import { CONTACT_REVERT_CASE_REASON } from '@/modules/accounts/contact-revert';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { refunds } from '@/modules/payments/schema';
import { MAX_PHOTO_BYTES, photoFromFile } from '@/modules/files/uploads';
import { threadParticipants, threads } from '@/modules/messaging/schema';
import { files, tasks } from '@/modules/tasks/schema';
import { hasBlocked, setBlocked } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { supportCaseEvents, supportCaseReads, supportCases } from './schema';
import { FIRST_RESPONSE_HOURS, queueOf } from './staff-domain';

/**
 * Support for members (blueprint 02 §1.2, 03 §9): their cases (requests, problem and safety reports,
 * reports about a person), the conversation with support, and reporting or blocking someone from a
 * conversation. A member sees the cases they opened, and cases where support wrote to them (the other
 * person on a booking): those show only their own conversation with support and the status, never the
 * opener's description or photos. Staff work the cases in `./staff.ts`.
 */

type CaseRow = typeof supportCases.$inferSelect;

/** Requests become the blueprint's case types where one fits. */
const REQUEST_TYPE: Record<SupportTopic, string> = { booking: 'request', payment: 'payment_issue', account: 'account', safety: 'safety', other: 'request' };
/** Staff's case subjects. `account_access` is the public contact form's "I can't get into my account" (5.22). */
const TOPIC_SUBJECT: Record<SupportTopic | 'account_access', string> = { booking: 'Booking', payment: 'Payment', account: 'Account', safety: 'Safety', other: 'Something else', account_access: 'Can’t get into their account' };
/** The case a "Not you?" link opens (5.23, `support_cases.reason`): what staff see, and what the account's owner sees. */
const CONTACT_REVERT_SUBJECT = { staff: '“Not you?” on a contact change', member: TOPIC_SUBJECT.account };
/** Reports support looks at first. */
const HIGH_PRIORITY_REASONS: ReadonlySet<ReportReason> = new Set(['harassment', 'scam_or_fraud', 'off_platform_payment', 'unsafe_behavior', 'discrimination']);

const CREATE_RULE = { limit: 5, windowSeconds: 60 * 60 };
const REPLY_RULE = { limit: 30, windowSeconds: 10 * 60 };
const REPORT_RULE = { limit: 10, windowSeconds: 24 * 60 * 60 };

export function memberCaseKind(type: string): MemberCaseKind {
  if (type === 'dispute' || type === 'no_show' || type === 'cancellation_review') return 'dispute';
  if (type === 'safety') return 'safety';
  if (type === 'report_user' || type === 'report_content') return 'report';
  return 'request';
}

export function caseStatusOf(value: string | null): CaseStatus {
  return (CASE_STATUSES as readonly string[]).includes(value ?? '') ? (value as CaseStatus) : 'open';
}

const isFinished = (status: CaseStatus) => status === 'resolved' || status === 'closed';

interface CaseLabel {
  subject: string;
  viewerRole?: 'poster' | 'helper';
}
const FALLBACK_LABEL: CaseLabel = { subject: 'Support' };

/** The task's title for booking cases, the person's name for reports, else the topic; and the viewer's side of the booking. */
export async function caseLabelsOf(db: Db, rows: CaseRow[], viewerId?: string): Promise<Map<string, CaseLabel>> {
  const bookingIds = [...new Set(rows.flatMap((row) => (row.bookingId ? [row.bookingId] : [])))];
  const userIds = [...new Set(rows.flatMap((row) => (row.subjectUserId ? [row.subjectUserId] : [])))];
  const [bookingRows, names] = await Promise.all([
    bookingIds.length > 0
      ? db
          .select({ id: bookings.id, title: tasks.title, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId })
          .from(bookings)
          .innerJoin(tasks, eq(tasks.id, bookings.taskId))
          .where(inArray(bookings.id, bookingIds))
      : Promise.resolve([]),
    userIds.length > 0 ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
  ]);
  const bookingOf = new Map(bookingRows.map((row) => [row.id, row]));
  const nameOf = new Map(names.map((row) => [row.id, row.name]));
  return new Map(
    rows.map((row) => {
      const name = row.subjectUserId ? nameOf.get(row.subjectUserId) : undefined;
      const booking = row.bookingId ? bookingOf.get(row.bookingId) : undefined;
      const topic =
        row.reason === CONTACT_REVERT_CASE_REASON ? CONTACT_REVERT_SUBJECT[viewerId ? 'member' : 'staff'] : row.topic ? TOPIC_SUBJECT[row.topic as keyof typeof TOPIC_SUBJECT] : undefined;
      const viewerRole = !viewerId ? undefined : booking?.posterUserId === viewerId ? 'poster' : booking?.helperUserId === viewerId ? 'helper' : undefined;
      return [row.id, { subject: name ?? booking?.title ?? topic ?? 'Support', ...(viewerRole ? { viewerRole } : {}) }];
    }),
  );
}

function rowOf(row: CaseRow, label: CaseLabel): Omit<SupportCaseRow, 'unread'> {
  return {
    id: row.id,
    kind: memberCaseKind(row.type),
    status: caseStatusOf(row.status),
    subject: label.subject,
    ...(label.viewerRole ? { viewerRole: label.viewerRole } : {}),
    ...(row.topic ? { topic: row.topic as SupportTopic } : {}),
    ...(row.bookingId ? { bookingId: row.bookingId } : {}),
    openedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Messages and status changes a member may see on a case: their own conversation with support. */
const visibleTo = (userId: string) =>
  and(eq(supportCaseEvents.visibility, 'participants'), or(isNull(supportCaseEvents.partyUserId), eq(supportCaseEvents.partyUserId, userId)));

/** Cases support wrote to the member about without them opening it. */
async function addressedCaseIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ caseId: supportCaseEvents.caseId })
    .from(supportCaseEvents)
    .where(and(eq(supportCaseEvents.partyUserId, userId), eq(supportCaseEvents.visibility, 'participants')));
  return rows.map((row) => row.caseId);
}

/** The case, if the member may see it: they opened it, or support wrote to them on it. */
async function visibleCase(db: Db, userId: string, caseId: string): Promise<{ row: CaseRow; isOpener: boolean } | null> {
  const [row] = await db.select().from(supportCases).where(eq(supportCases.id, String(caseId))).limit(1);
  if (!row) return null;
  if (row.openedByUserId === userId) return { row, isOpener: true };
  const [addressed] = await db
    .select({ id: supportCaseEvents.id })
    .from(supportCaseEvents)
    .where(and(eq(supportCaseEvents.caseId, row.id), eq(supportCaseEvents.partyUserId, userId), eq(supportCaseEvents.visibility, 'participants')))
    .limit(1);
  return addressed ? { row, isOpener: false } : null;
}

export async function markCaseRead(db: Pick<Db, 'insert'>, caseId: string, userId: string, now: Date): Promise<void> {
  await db
    .insert(supportCaseReads)
    .values({ caseId, userId, readAt: now })
    .onConflictDoUpdate({ target: [supportCaseReads.caseId, supportCaseReads.userId], set: { readAt: now } });
}

/** `/app/support`: open cases first, then the rest, each newest first; and recent bookings to attach. */
export async function getSupportPage(db: Db, userId: string): Promise<SupportPageData> {
  const addressed = await addressedCaseIds(db, userId);
  const rows = await db
    .select()
    .from(supportCases)
    .where(addressed.length > 0 ? or(eq(supportCases.openedByUserId, userId), inArray(supportCases.id, addressed)) : eq(supportCases.openedByUserId, userId))
    .orderBy(desc(supportCases.updatedAt))
    .limit(50);
  const ids = rows.map((row) => row.id);
  const [labels, supportMessages, reads, recent] = await Promise.all([
    caseLabelsOf(db, rows, userId),
    ids.length > 0
      ? db
          .select({ caseId: supportCaseEvents.caseId, createdAt: supportCaseEvents.createdAt })
          .from(supportCaseEvents)
          .where(
            and(
              inArray(supportCaseEvents.caseId, ids),
              eq(supportCaseEvents.kind, 'message'),
              eq(supportCaseEvents.visibility, 'participants'),
              eq(supportCaseEvents.partyUserId, userId),
              ne(supportCaseEvents.authorUserId, userId),
            ),
          )
      : Promise.resolve([]),
    ids.length > 0
      ? db.select().from(supportCaseReads).where(and(eq(supportCaseReads.userId, userId), inArray(supportCaseReads.caseId, ids)))
      : Promise.resolve([]),
    db
      .select({ id: bookings.id, title: tasks.title, start: bookings.startAt })
      .from(bookings)
      .innerJoin(tasks, eq(tasks.id, bookings.taskId))
      .where(and(or(eq(bookings.posterUserId, userId), eq(bookings.helperUserId, userId)), ne(bookings.status, 'pending_funding')))
      .orderBy(desc(bookings.startAt))
      .limit(10),
  ]);
  const lastFromSupport = new Map<string, Date>();
  for (const message of supportMessages) {
    const seen = lastFromSupport.get(message.caseId);
    if (!seen || message.createdAt > seen) lastFromSupport.set(message.caseId, message.createdAt);
  }
  const readAt = new Map(reads.map((read) => [read.caseId, read.readAt]));
  const cases = rows
    .map((row): SupportCaseRow => {
      const fromSupport = lastFromSupport.get(row.id);
      const read = readAt.get(row.id);
      return { ...rowOf(row, labels.get(row.id) ?? FALLBACK_LABEL), unread: Boolean(fromSupport && (!read || fromSupport > read)) };
    })
    // A stable sort keeps the newest first within each group.
    .sort((a, b) => Number(isFinished(a.status)) - Number(isFinished(b.status)));
  return {
    cases,
    bookings: recent.map((row) => ({ id: row.id, title: row.title, start: row.start.toISOString() })),
    maxPhotoMegabytes: Math.round(MAX_PHOTO_BYTES / (1024 * 1024)),
  };
}

export async function createSupportRequest(db: Db, userId: string, input: NewSupportRequestInput, now: Date): Promise<ActionResult> {
  const parsed = newSupportRequestInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { topic, description } = parsed.data;
  const bookingId = parsed.data.bookingId || undefined;
  if (bookingId) {
    const [mine] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), or(eq(bookings.posterUserId, userId), eq(bookings.helperUserId, userId))))
      .limit(1);
    if (!mine) return { ok: false, code: 'validation_failed', fieldErrors: { bookingId: ['invalid'] } };
  }
  const photoIds = [...new Set(parsed.data.photoIds)];
  if (photoIds.length > 0) {
    const owned = await db
      .select({ id: files.id })
      .from(files)
      .where(and(inArray(files.id, photoIds), eq(files.ownerUserId, userId), eq(files.kind, 'evidence')));
    if (owned.length !== photoIds.length) return { ok: false, code: 'validation_failed', fieldErrors: { photoIds: ['invalid'] } };
  }
  const limited = await consumeRateLimit(db, `support:${userId}`, CREATE_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };

  const id = newId('case');
  const type = REQUEST_TYPE[topic];
  await db.transaction(async (tx) => {
    await tx.insert(supportCases).values({
      id,
      type,
      status: 'open',
      priority: topic === 'safety' ? 'high' : 'normal',
      bookingId: bookingId ?? null,
      openedByUserId: userId,
      topic,
      description,
      fileIds: photoIds,
      createdAt: now,
      updatedAt: now,
    });
    await markCaseRead(tx, id, userId, now);
    await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'support.case_opened', aggregateType: 'support_case', aggregateId: id, payload: { caseId: id, type, openedByUserId: userId } });
  });
  return { ok: true, code: 'submitted', redirectTo: routes.app.supportCase(id) };
}

/**
 * A review's private feedback (completion plan P2): a low-priority request only its author is on. It names
 * the task (`context.taskId`) but not the booking, so the other person never becomes a party: replies and
 * the resolution reach the author alone. A system note tells staff where it came from.
 */
export async function openReviewFeedbackCase(
  db: Db,
  input: { userId: string; taskId: string; taskTitle: string; rating: number; subjectName: string; feedback: string },
  now: Date,
): Promise<string> {
  const id = newId('case');
  await db.transaction(async (tx) => {
    await tx.insert(supportCases).values({
      id,
      type: REQUEST_TYPE.booking,
      status: 'open',
      priority: 'low',
      openedByUserId: input.userId,
      topic: 'booking',
      context: { taskId: input.taskId },
      description: input.feedback,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(supportCaseEvents).values({
      id: newId('cev'),
      caseId: id,
      kind: 'note',
      authorUserId: null,
      visibility: 'internal',
      body: `Sent privately with a ${input.rating}-star review of ${input.subjectName} for “${input.taskTitle}”. Only the author is on this case; ${input.subjectName} can't see it.`,
      createdAt: now,
    });
    await markCaseRead(tx, id, input.userId, now);
    await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'support.case_opened', aggregateType: 'support_case', aggregateId: id, payload: { caseId: id, type: REQUEST_TYPE.booking, openedByUserId: input.userId } });
  });
  return id;
}

/**
 * `/app/support/[caseId]` for the people who may see it (anyone else: not found). Opening it reads it (`markRead`: the
 * Help conversation reads a case only while it's on screen).
 */
export async function getSupportCasePage(db: Db, userId: string, caseId: string, now: Date, { markRead = true }: { markRead?: boolean } = {}): Promise<SupportCasePageData | null> {
  const found = await visibleCase(db, userId, caseId);
  if (!found) return null;
  const { row, isOpener } = found;
  const [labels, events] = await Promise.all([
    caseLabelsOf(db, [row], userId),
    db
      .select()
      .from(supportCaseEvents)
      .where(and(eq(supportCaseEvents.caseId, row.id), visibleTo(userId)))
      .orderBy(asc(supportCaseEvents.createdAt)),
  ]);
  const openingFiles = isOpener ? row.fileIds : [];
  const fileIds = [...new Set([...openingFiles, ...events.flatMap((event) => event.fileIds)])];
  const fileRows = fileIds.length > 0 ? await db.select().from(files).where(inArray(files.id, fileIds)) : [];
  const photoOf = new Map(fileRows.map((file) => [file.id, photoFromFile(file)]));
  const photos = (ids: string[]): { photos?: Photo[] } => {
    const list = ids.flatMap((id) => photoOf.get(id) ?? []);
    return list.length > 0 ? { photos: list } : {};
  };

  // Only the person who opened the case sees what they wrote when opening it.
  const opening: CaseEventView[] = isOpener
    ? [{ id: `${row.id}_opened`, kind: 'message', from: 'me', body: row.description, ...photos(row.fileIds), at: row.createdAt.toISOString() }]
    : [];
  const conversation = events.map((event): CaseEventView =>
    event.kind === 'status'
      ? { id: event.id, kind: 'status', from: 'system', status: caseStatusOf(event.status), at: event.createdAt.toISOString() }
      : { id: event.id, kind: 'message', from: event.meta?.assistant ? 'assistant' : event.authorUserId === userId ? 'me' : 'support', body: event.body ?? '', ...photos(event.fileIds), at: event.createdAt.toISOString() },
  );
  if (markRead) await markCaseRead(db, row.id, userId, now);
  const view = rowOf(row, labels.get(row.id) ?? FALLBACK_LABEL);
  // In time order: a case opened from the assistant starts with the chat that came before the request (a stable sort,
  // so the opening stays first among events at the same moment).
  const ordered = [...opening, ...conversation].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { case: { ...view, description: isOpener ? row.description : '' }, events: ordered, canReply: view.status !== 'closed' };
}

/** The member writes to support. A case waiting on a member goes back to support. */
export async function replyToSupportCase(db: Db, userId: string, caseId: string, input: SupportReplyInput, now: Date): Promise<ActionResult> {
  const parsed = supportReplyInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const found = await visibleCase(db, userId, caseId);
  if (!found || found.row.status === 'closed') return { ok: false, code: 'not_allowed' };
  const { row } = found;
  const limited = await consumeRateLimit(db, `support-reply:${userId}`, REPLY_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };

  const waitingOnMember = row.status === 'awaiting_poster' || row.status === 'awaiting_helper';
  await db.transaction(async (tx) => {
    await tx.insert(supportCaseEvents).values({ id: newId('cev'), caseId: row.id, kind: 'message', authorUserId: userId, partyUserId: userId, body: parsed.data.body, createdAt: now });
    if (waitingOnMember) {
      await tx.insert(supportCaseEvents).values({ id: newId('cev'), caseId: row.id, kind: 'status', status: 'awaiting_support', createdAt: new Date(now.getTime() + 1) });
    }
    await tx
      .update(supportCases)
      .set({ ...(waitingOnMember ? { status: 'awaiting_support', version: row.version + 1 } : {}), updatedAt: now })
      .where(eq(supportCases.id, row.id));
    await markCaseRead(tx, row.id, userId, now);
  });
  return { ok: true, code: 'sent' };
}

// ---- Cases from the support assistant (2026-11-22) -----------------------------------------------------------

/** A question to the assistant and its answer, already checked (src/modules/assist/assistant-turns.ts). */
export interface AssistantCaseTurn {
  question: string;
  answer: string;
  /** The help articles the answer used, by title. */
  sources: string[];
  at: Date;
}

/** Each topic's queue target for a first reply, in hours ("Usually replies within 24 hours"). */
export const TOPIC_REPLY_HOURS = Object.fromEntries(SUPPORT_TOPICS.map((topic) => [topic, FIRST_RESPONSE_HOURS[queueOf(REQUEST_TYPE[topic])]])) as Record<SupportTopic, number>;

/** The person's recent bookings (newest first), to name one in a request. */
export async function recentBookingsFor(db: Db, userId: string): Promise<{ id: string; title: string; start: string }[]> {
  const rows = await db
    .select({ id: bookings.id, title: tasks.title, start: bookings.startAt })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .where(and(or(eq(bookings.posterUserId, userId), eq(bookings.helperUserId, userId)), ne(bookings.status, 'pending_funding')))
    .orderBy(desc(bookings.startAt))
    .limit(10);
  return rows.map((row) => ({ id: row.id, title: row.title, start: row.start.toISOString() }));
}

/**
 * "Talk to a person" in the Help conversation: a request like one from `/app/support`, with the chat attached. Support
 * sees a note that it came from the assistant (and what couldn't be checked), then the chat (the person's questions as
 * their messages, the assistant's answers marked as the assistant's), then what the person asked for. A safety topic, or
 * an answer that flagged danger, goes in as high priority. Same rate limit as other requests.
 */
export async function openCaseFromAssistant(
  db: Db,
  userId: string,
  input: { topic: SupportTopic; details: string; bookingId?: string; turns: AssistantCaseTurn[]; dropped: number; handoff: AssistantHandoff },
  now: Date,
): Promise<ActionResult> {
  if (input.bookingId) {
    const [mine] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, input.bookingId), or(eq(bookings.posterUserId, userId), eq(bookings.helperUserId, userId))))
      .limit(1);
    if (!mine) return { ok: false, code: 'validation_failed', fieldErrors: { bookingId: ['invalid'] } };
  }
  const limited = await consumeRateLimit(db, `support:${userId}`, CREATE_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };

  const id = newId('case');
  const type = REQUEST_TYPE[input.topic];
  const urgent = input.handoff === 'urgent';
  // Never after the request itself, whatever a browser's clock said.
  const turns = input.turns.filter((turn) => turn.at.getTime() < now.getTime());
  const start = turns[0] ? new Date(turns[0].at.getTime() - 1) : now;
  const note = [
    `Opened from the support assistant in Messages after ${turns.length === 1 ? '1 question' : `${turns.length} questions`}. The chat comes first; the assistant's answers are marked. They come from an AI and can be wrong: check before acting on one.`,
    ...(urgent ? ['The assistant flagged that someone may be in danger.'] : []),
    ...(input.dropped > 0 ? [`${input.dropped === 1 ? '1 earlier turn' : `${input.dropped} earlier turns`} couldn't be verified and ${input.dropped === 1 ? 'was' : 'were'} left out.`] : []),
  ].join(' ');
  await db.transaction(async (tx) => {
    await tx.insert(supportCases).values({
      id,
      type,
      status: 'open',
      priority: urgent || input.topic === 'safety' ? 'high' : 'normal',
      bookingId: input.bookingId ?? null,
      openedByUserId: userId,
      topic: input.topic,
      context: { assistant: true },
      description: input.details,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(supportCaseEvents).values([
      { id: newId('cev'), caseId: id, kind: 'note', authorUserId: null, visibility: 'internal', body: note, createdAt: start },
      ...turns.flatMap((turn) => [
        { id: newId('cev'), caseId: id, kind: 'message', authorUserId: userId, partyUserId: userId, body: turn.question, createdAt: turn.at },
        {
          id: newId('cev'),
          caseId: id,
          kind: 'message',
          authorUserId: null,
          partyUserId: userId,
          body: turn.sources.length > 0 ? `${turn.answer}\n\n${turn.sources.map((title) => `· ${title}`).join('\n')}` : turn.answer,
          meta: { assistant: true },
          createdAt: new Date(turn.at.getTime() + 1),
        },
      ]),
    ]);
    await markCaseRead(tx, id, userId, now);
    await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'support.case_opened', aggregateType: 'support_case', aggregateId: id, payload: { caseId: id, type, openedByUserId: userId } });
  });
  return { ok: true, code: 'submitted' };
}

/** The person's newest cases from the assistant, newest first. */
export async function assistantCasesOf(db: Db, userId: string, limit = 5): Promise<CaseRow[]> {
  return db
    .select()
    .from(supportCases)
    .where(and(eq(supportCases.openedByUserId, userId), sql`${supportCases.context}->>'assistant' = 'true'`))
    .orderBy(desc(supportCases.createdAt))
    .limit(limit);
}

export const isFinishedCase = (row: Pick<CaseRow, 'status'>) => isFinished(caseStatusOf(row.status));

/** When support last wrote to the person on a case, and when the person last read it. */
async function supportReplyFacts(db: Db, userId: string, caseId: string): Promise<{ unread: boolean }> {
  const [[last], [read]] = await Promise.all([
    db
      .select({ createdAt: supportCaseEvents.createdAt })
      .from(supportCaseEvents)
      .where(and(eq(supportCaseEvents.caseId, caseId), eq(supportCaseEvents.kind, 'message'), eq(supportCaseEvents.visibility, 'participants'), eq(supportCaseEvents.partyUserId, userId), ne(supportCaseEvents.authorUserId, userId)))
      .orderBy(desc(supportCaseEvents.createdAt))
      .limit(1),
    db.select({ readAt: supportCaseReads.readAt }).from(supportCaseReads).where(and(eq(supportCaseReads.caseId, caseId), eq(supportCaseReads.userId, userId))).limit(1),
  ]);
  return { unread: Boolean(last && (!read || last.createdAt > read.readAt)) };
}

/** An open case from the assistant, as the Help conversation shows it. `markRead` reads it (it's on screen). */
export async function helpCaseView(db: Db, userId: string, row: CaseRow, now: Date, { markRead }: { markRead: boolean }): Promise<{ view: HelpCaseView; wasUnread: boolean } | null> {
  const { unread } = await supportReplyFacts(db, userId, row.id);
  const page = await getSupportCasePage(db, userId, row.id, now, { markRead });
  if (!page) return null;
  return {
    wasUnread: unread,
    view: {
      id: row.id,
      status: page.case.status,
      topic: (SUPPORT_TOPICS as readonly string[]).includes(row.topic ?? '') ? (row.topic as SupportTopic) : 'other',
      events: page.events,
      canReply: page.canReply,
      unread: markRead ? false : unread,
      openedAt: row.createdAt.toISOString(),
      replyHours: FIRST_RESPONSE_HOURS[queueOf(row.type)],
    },
  };
}

/** Whether the person's open case from the assistant has a reply they haven't read: 1 or 0 (the chat button's count). */
export async function helpUnreadCount(db: Db, userId: string): Promise<number> {
  const open = (await assistantCasesOf(db, userId, 3)).find((row) => !isFinishedCase(row));
  return open && (await supportReplyFacts(db, userId, open.id)).unread ? 1 : 0;
}

/** The pinned Help row: the open case's state and its last line (support's, the person's or the assistant's). */
export async function helpRowFacts(db: Db, userId: string): Promise<{ id: string; status: CaseStatus; unread: boolean; last?: { from: CaseEventView['from']; body: string; at: string } } | undefined> {
  const open = (await assistantCasesOf(db, userId, 3)).find((row) => !isFinishedCase(row));
  if (!open) return undefined;
  const [{ unread }, [last]] = await Promise.all([
    supportReplyFacts(db, userId, open.id),
    db
      .select({ authorUserId: supportCaseEvents.authorUserId, body: supportCaseEvents.body, meta: supportCaseEvents.meta, createdAt: supportCaseEvents.createdAt })
      .from(supportCaseEvents)
      .where(and(eq(supportCaseEvents.caseId, open.id), eq(supportCaseEvents.kind, 'message'), visibleTo(userId)))
      .orderBy(desc(supportCaseEvents.createdAt))
      .limit(1),
  ]);
  // The request itself is newer than the chat before it: until support or the person writes again, it's the last line.
  const request = { from: 'me' as const, body: open.description.slice(0, 200), at: open.createdAt.toISOString() };
  const line =
    !last || last.createdAt < open.createdAt
      ? request
      : { from: last.meta?.assistant ? ('assistant' as const) : last.authorUserId === userId ? ('me' as const) : ('support' as const), body: (last.body ?? '').slice(0, 200), at: last.createdAt.toISOString() };
  return { id: open.id, status: caseStatusOf(open.status), unread, last: line };
}

// ---- Disputes on the booking page (UI-026) -----------------------------------------------------------

/**
 * The latest problem report on a booking, as one of its two people sees it: the client always can open
 * the case; the helper once support wrote to them. Money is projected per role: the client's dispute
 * refunds, or what the helper receives.
 */
export async function getBookingDispute(db: Db, bookingId: string, viewerId: string, role: 'poster' | 'helper'): Promise<BookingDisputeView | undefined> {
  const [row] = await db
    .select()
    .from(supportCases)
    .where(and(eq(supportCases.bookingId, bookingId), eq(supportCases.type, 'dispute')))
    .orderBy(desc(supportCases.createdAt))
    .limit(1);
  if (!row) return undefined;
  const canOpenCase = row.openedByUserId === viewerId || (await visibleCase(db, viewerId, row.id)) !== null;
  let resolution: BookingDisputeView['resolution'];
  if (row.resolution && row.resolvedAt) {
    const money =
      role === 'poster'
        ? (await db.select({ amountCents: refunds.amountCents }).from(refunds).where(and(eq(refunds.bookingId, bookingId), eq(refunds.status, 'succeeded'), eq(refunds.reason, 'dispute_settlement')))).reduce(
            (sum, item) => sum + item.amountCents,
            0,
          )
        : (await db.select({ amountCents: earnings.amountCents }).from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'earnings')))).reduce((sum, item) => sum + item.amountCents, 0);
    resolution = {
      type: row.resolution as CaseResolution,
      summary: row.resolutionSummary ?? '',
      at: row.resolvedAt.toISOString(),
      ...(role === 'poster' && money > 0 ? { refundCents: money } : {}),
      ...(role === 'helper' && money > 0 ? { receivesCents: money } : {}),
    };
  }
  return {
    caseId: row.id,
    status: caseStatusOf(row.status),
    reason: (row.reason ?? 'other') as ProblemReason,
    openedAt: row.createdAt.toISOString(),
    canOpenCase,
    ...(resolution ? { resolution } : {}),
  };
}

// ---- Reporting and blocking from a conversation -------------------------------------------------------

async function otherPersonIn(db: Db, userId: string, threadId: string) {
  const [thread] = await db.select().from(threads).where(eq(threads.id, String(threadId))).limit(1);
  if (!thread) return null;
  const people = await db.select({ userId: threadParticipants.userId }).from(threadParticipants).where(eq(threadParticipants.threadId, thread.id));
  if (!people.some((person) => person.userId === userId)) return null;
  const otherId = people.find((person) => person.userId !== userId)?.userId;
  if (!otherId) return null;
  const [other] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, otherId)).limit(1);
  return other ? { thread, other } : null;
}

/** Who the conversation's Report and Block menu is about (null when the viewer isn't in it). */
export async function getReportSubject(db: Db, userId: string, threadId: string): Promise<ReportSubject | null> {
  const found = await otherPersonIn(db, userId, threadId);
  if (!found) return null;
  return { userId: found.other.id, displayName: found.other.name, blocked: await hasBlocked(db, userId, found.other.id) };
}

/** A report about the other person, with the conversation (and its task and booking) for context. */
export async function reportFromThread(db: Db, userId: string, threadId: string, input: ReportInput, now: Date): Promise<ActionResult> {
  const parsed = reportInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const found = await otherPersonIn(db, userId, threadId);
  if (!found) return { ok: false, code: 'unknown' };
  const limited = await consumeRateLimit(db, `report:${userId}`, REPORT_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };

  const id = newId('case');
  await db.transaction(async (tx) => {
    await tx.insert(supportCases).values({
      id,
      type: 'report_user',
      status: 'open',
      priority: HIGH_PRIORITY_REASONS.has(parsed.data.reason) ? 'high' : 'normal',
      bookingId: found.thread.kind === 'booking' ? found.thread.linkedId : null,
      openedByUserId: userId,
      subjectUserId: found.other.id,
      // A direct conversation (2026-11-21) has no task to point at.
      context: { threadId: found.thread.id, ...(found.thread.taskId ? { taskId: found.thread.taskId } : {}) },
      reason: parsed.data.reason,
      description: parsed.data.details,
      createdAt: now,
      updatedAt: now,
    });
    await markCaseRead(tx, id, userId, now);
    await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'support.case_opened', aggregateType: 'support_case', aggregateId: id, payload: { caseId: id, type: 'report_user', openedByUserId: userId } });
  });
  return { ok: true, code: 'submitted' };
}

/** Block or unblock the other person in a conversation. */
export async function setThreadBlock(db: Db, userId: string, threadId: string, blocked: boolean, now: Date): Promise<ActionResult> {
  const found = await otherPersonIn(db, userId, threadId);
  if (!found) return { ok: false, code: 'unknown' };
  await setBlocked(db, userId, found.other.id, Boolean(blocked), now);
  return { ok: true, code: 'updated' };
}
