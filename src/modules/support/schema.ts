import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';

/**
 * Support cases (docs/blueprint/03 §9). Disputes and safety reports open them from a booking; members
 * open requests from `/app/support` and reports from a conversation. `booking_id` is a plain column so
 * support doesn't depend on bookings.
 */
export const supportCases = pgTable(
  'support_cases',
  {
    id: text('id').primaryKey(),
    /** dispute | no_show | cancellation_review | report_user | report_content | safety | payment_issue | reward_issue | account | request */
    type: text('type').notNull(),
    /** open | awaiting_poster | awaiting_helper | awaiting_support | escalated | resolved | closed (`CASE_STATUSES`) */
    status: text('status').notNull(),
    priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
    bookingId: text('booking_id'),
    /** Null for a request sent from the public contact form (5.22), which has only `contactEmail`. */
    openedByUserId: text('opened_by_user_id').references(() => users.id),
    /**
     * A public request's reply address (5.22): typed by someone who isn't signed in, so never proof of an
     * account. Replies go there by email, in `contactLocale`.
     */
    contactEmail: text('contact_email'),
    contactLocale: text('contact_locale'),
    /** Requests: what the member asked about (`SUPPORT_TOPICS`). */
    topic: text('topic'),
    /** Reports: the person reported. */
    subjectUserId: text('subject_user_id').references(() => users.id),
    /** Where a report came from (the conversation and its task), for support's review. */
    // `answer`: a report of the question's answer (its poster is the case's subject), not the question (sweep QA3).
    // A block-evasion flag (J-AB4) also names who was reached and the account they blocked.
    // `assistant`: opened from the support assistant in Messages (2026-11-22), its chat attached as messages.
    context: jsonb('context').$type<{ threadId?: string; taskId?: string; reviewId?: string; postId?: string; replyId?: string; questionId?: string; answer?: boolean; thanksId?: string; groupMessageId?: string; recipientUserId?: string; blockedUserId?: string; assistant?: boolean }>(),
    reason: text('reason'),
    description: text('description').notNull().default(''),
    /** Photos sent with the case (files of kind `evidence`). */
    fileIds: jsonb('file_ids').$type<string[]>().notNull().default([]),
    /** The staff member working the case. */
    assigneeUserId: text('assignee_user_id').references(() => users.id),
    /** First staff reply (the first-response target stops here). */
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    /** `CASE_RESOLUTIONS`, with the summary sent to the people on the case. */
    resolution: text('resolution'),
    resolutionSummary: text('resolution_summary'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** Staff changes check it, so two people can't move the same case at once. */
    version: integer('version').notNull().default(1),
    /**
     * Live chat (2026-11-22, owner: "let users wait until support is attending, and I will support chatting"): when the
     * member asked for a person from TasksNearMe Help, who from support joined and when, and when the chat ended. A
     * request waits in the live queue until someone joins; the case stays a case either way.
     */
    liveRequestedAt: timestamp('live_requested_at', { withTimezone: true }),
    liveAgentUserId: text('live_agent_user_id').references(() => users.id),
    liveJoinedAt: timestamp('live_joined_at', { withTimezone: true }),
    liveEndedAt: timestamp('live_ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('support_cases_booking_idx').on(t.bookingId),
    index('support_cases_status_idx').on(t.status, t.createdAt),
    index('support_cases_opener_idx').on(t.openedByUserId, t.updatedAt),
    index('support_cases_assignee_idx').on(t.assigneeUserId, t.status),
    index('support_cases_contact_idx').on(t.contactEmail, t.createdAt),
    // The live queue and the chats under way.
    index('support_cases_live_idx').on(t.liveRequestedAt).where(sql`${t.liveEndedAt} is null`),
  ],
);

/**
 * A case's conversation after it opened (the opening description is the case itself): messages between
 * support and each person on the case, internal notes, and status changes. Each person sees only their
 * own conversation with support and the status changes, never notes.
 */
export const supportCaseEvents = pgTable(
  'support_case_events',
  {
    id: text('id').primaryKey(),
    caseId: text('case_id')
      .notNull()
      .references(() => supportCases.id),
    // `rating` (2026-11-23): the opener's rating of the help (`meta.rating`, `body` their comment), staff only (`internal`).
    kind: text('kind').notNull(), // message | note | status | assignment | resolution | live | rating
    /** The member or a staff member; null for status changes and a public request's follow-ups (`meta.fromContact`). */
    authorUserId: text('author_user_id').references(() => users.id),
    /** Whose conversation with support this belongs to; null for the whole case (status changes, notes). */
    partyUserId: text('party_user_id').references(() => users.id),
    visibility: text('visibility').notNull().default('participants'), // participants | internal
    body: text('body'),
    fileIds: jsonb('file_ids').$type<string[]>().notNull().default([]),
    /** Status changes: the new status. */
    status: text('status'),
    /** Assignment and resolution changes: the new assignee (null when unassigned) or the resolution. */
    /** `emailed`: staff's answer went to a public request's address. `fromContact`: that address wrote again (5.22). */
    /** `assistant`: an answer from the support assistant, in the chat attached to a case opened from it (no author). */
    /** `rating`, `changedAt`: a rating event's good or bad, and when the member last changed it (2026-11-23). */
    meta: jsonb('meta').$type<{ assigneeUserId?: string | null; resolution?: string; reviewAction?: 'hidden' | 'shown'; thanksAction?: 'hidden' | 'shown'; groupMessageAction?: 'removed' | 'restored'; questionAction?: 'hidden' | 'removed' | 'restored'; emailed?: boolean; fromContact?: boolean; refundRequestId?: string; assistant?: boolean; live?: 'joined' | 'ended'; rating?: 'good' | 'bad'; changedAt?: string }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('support_case_events_case_idx').on(t.caseId, t.createdAt)],
);

/** When each member last looked at a case (unread marks on `/app/support`). */
export const supportCaseReads = pgTable(
  'support_case_reads',
  {
    caseId: text('case_id')
      .notNull()
      .references(() => supportCases.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    readAt: timestamp('read_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.userId] })],
);

/**
 * A refund staff asked for above their own limit (blueprint 08: agents $100, leads $500, finance with a
 * second approval above that), waiting for someone allowed to approve it. Approving refunds the charge.
 */
export const refundRequests = pgTable(
  'refund_requests',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    reason: text('reason').notNull(), // goodwill | fraud | case_resolution
    note: text('note').notNull(),
    requestedByUserId: text('requested_by_user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull(), // pending | approved | declined
    decidedByUserId: text('decided_by_user_id').references(() => users.id),
    decisionNote: text('decision_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * A case resolution over the resolver's limit (blueprint 08's dual approval): the case it resolves once a different
     * finance or admin approves, and the resolution as asked, applied then with its money worked out again.
     */
    caseId: text('case_id').references(() => supportCases.id),
    resolution: text('resolution'),
    resolutionInput: jsonb('resolution_input').$type<{ summary: string; settlePriceCents?: number; goodwillCents?: number }>(),
  },
  (t) => [index('refund_requests_booking_idx').on(t.bookingId, t.status)],
);


/**
 * Saved replies ("macros"): text staff start a reply from. Leads write them, for one queue or all; anyone
 * who works cases uses them. `{first_name}` and `{staff_name}` are filled in when the reply is sent.
 * Archived ones stay for the audit trail.
 */
export const supportMacros = pgTable(
  'support_macros',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** `ADMIN_QUEUES`, or null for every queue. */
    queue: text('queue'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    updatedByUserId: text('updated_by_user_id')
      .notNull()
      .references(() => users.id),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('support_macros_queue_idx').on(t.archivedAt, t.queue)],
);
