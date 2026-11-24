import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { TimelineEvent } from '@/contracts';
import { users } from '../accounts/schema';

/**
 * Threads and messages (docs/blueprint/08 §117): one thread per offer, invite, booking, or case, and one direct
 * conversation per pair of people (2026-11-21). Bodies are stored as written; contact details are masked when shown,
 * until a booking is confirmed. Linked ids are plain columns so messaging doesn't depend on offers or bookings.
 */
export const threads = pgTable(
  'threads',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // offer | invite | booking | case | series | direct
    /** The offer, invite, booking, series or case id; for `direct`, the two people's ids in order (`directPairKey`). */
    linkedId: text('linked_id').notNull(),
    /** The task it's about; null for a direct conversation. */
    taskId: text('task_id'),
    /** Who started a direct conversation (their daily allowance and first messages count it); null for the others. */
    startedByUserId: text('started_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('threads_kind_linked_idx').on(t.kind, t.linkedId),
    index('threads_last_message_idx').on(t.lastMessageAt),
    // A person's direct starts in the last day (their allowance).
    index('threads_started_by_idx').on(t.startedByUserId, t.createdAt).where(sql`started_by_user_id is not null`),
  ],
);

export const threadParticipants = pgTable(
  'thread_participants',
  {
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    /** No "sent you a message" for this conversation, by any channel, and it doesn't count in the Messages badge (2026-11-23). */
    muted: boolean('muted').notNull().default(false),
    /** Pinned on top of the person's list (at most `PINNED_CONVERSATIONS_MAX`), since when (2026-11-23). */
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    /** Out of the list, under Archived, since when; a new message from the other person brings it back (2026-11-23). */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    /**
     * A direct conversation the person takes messages in (2026-11-23): the one who started it, someone they've talked to
     * about a task, or once they accept it or answer. Null: a message request (Accept, Ignore or Block). Unused elsewhere.
     */
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] }), index('thread_participants_user_idx').on(t.userId)],
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id),
    /** Null for status and system messages. */
    senderUserId: text('sender_user_id').references(() => users.id),
    kind: text('kind').notNull(), // text | status | system
    body: text('body').notNull().default(''),
    attachmentFileIds: jsonb('attachment_file_ids').$type<string[]>().notNull().default([]),
    /** Status and system messages: the event to word. */
    event: jsonb('event').$type<Pick<TimelineEvent, 'type' | 'params'>>(),
    flaggedAt: timestamp('flagged_at', { withTimezone: true }),
    /** A reply to an earlier message in the same thread (completion plan 7.3): shown quoted above it. */
    replyToMessageId: text('reply_to_message_id'),
    /**
     * The composer's key for this message (a client UUID per message; bad connections pass, J-N1): a repeat after an
     * answer that never arrived is the same message, not a second one. Unique per sender.
     */
    requestKey: text('request_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_thread_idx').on(t.threadId, t.createdAt),
    uniqueIndex('messages_sender_request_key_idx').on(t.senderUserId, t.requestKey).where(sql`request_key is not null`),
  ],
);

/** Reactions on a message (completion plan 7.3): one of a few emoji, once each per person; the thread's people only. */
export const messageReactions = pgTable(
  'message_reactions',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    emoji: text('emoji').notNull(), // MESSAGE_REACTIONS: thumbs_up | heart | laugh | wow | sad | pray | fire | party | clap | check
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

/** A person's saved replies (completion plan 7.3): short texts with {first_name} and {task}, filled in when used. */
export const savedReplies = pgTable(
  'saved_replies',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('saved_replies_user_idx').on(t.userId, t.createdAt)],
);

/** Blocked people can't message, offer, or invite each other (blueprint 08). */
export const blocks = pgTable(
  'blocks',
  {
    blockerId: text('blocker_id')
      .notNull()
      .references(() => users.id),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);
