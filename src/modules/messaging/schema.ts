import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { TimelineEvent } from '@/contracts';
import { users } from '../accounts/schema';

/**
 * Threads and messages (docs/blueprint/08 §117): one thread per offer, invite, booking, or case.
 * Bodies are stored as written; contact details are masked when shown, until a booking is confirmed.
 * Linked ids are plain columns so messaging doesn't depend on offers or bookings.
 */
export const threads = pgTable(
  'threads',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // offer | invite | booking | case
    /** The offer, invite, booking or case id. */
    linkedId: text('linked_id').notNull(),
    taskId: text('task_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('threads_kind_linked_idx').on(t.kind, t.linkedId), index('threads_last_message_idx').on(t.lastMessageAt)],
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
    muted: boolean('muted').notNull().default(false),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_thread_idx').on(t.threadId, t.createdAt)],
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
