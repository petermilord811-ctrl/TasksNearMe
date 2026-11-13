import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { AttentionTarget, NotificationView } from '@/contracts';
import { users } from '../accounts/schema';

/**
 * In-app notifications (`/app/notifications`), made from outbox events by the dispatcher. One row per
 * person per event (`source_event_id` + `user_id` is unique), so dispatching twice adds nothing.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(),
    title: text('title'),
    actorName: text('actor_name'),
    params: jsonb('params').$type<NonNullable<NotificationView['params']>>(),
    target: jsonb('target').$type<AttentionTarget>().notNull(),
    sourceEventId: text('source_event_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt), uniqueIndex('notifications_event_user_idx').on(t.sourceEventId, t.userId)],
);

/**
 * Email and text messages for each notification (blueprint 08 `notification_deliveries`, backlog B-028):
 * one row per notification and channel. `sending` while a send is in flight; `held` through quiet hours
 * until `send_after`; `failed` with the error and the next try in `send_after` (none after the last);
 * `skipped` with why (preference off, no email, no verified phone); `sent`.
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: text('id').primaryKey(),
    notificationId: text('notification_id')
      .notNull()
      .references(() => notifications.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    channel: text('channel').notNull(), // email | sms
    status: text('status').notNull(), // sending | sent | held | failed | skipped
    reason: text('reason'),
    sendAfter: timestamp('send_after', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notification_deliveries_channel_idx').on(t.notificationId, t.channel),
    index('notification_deliveries_due_idx').on(t.status, t.sendAfter),
    index('notification_deliveries_user_idx').on(t.userId, t.createdAt),
  ],
);

/** Notification preferences by topic and channel; a missing row means the default. */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    topic: text('topic').notNull(),
    channel: text('channel').notNull(),
    enabled: text('enabled').notNull(), // 'true' | 'false'
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notification_preferences_idx').on(t.userId, t.topic, t.channel)],
);

/**
 * Data export and account deletion requests (src/modules/privacy). Exports: `requested` → `ready` (a file
 * to download until `expiresAt`) → `expired`. Deletions: `requested` → `done` at `scheduledFor` once
 * nothing is open (`blockedReason` says what it waits for), or `withdrawn` when the person keeps the account.
 */
export const privacyRequests = pgTable(
  'privacy_requests',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(), // export | deletion
    status: text('status').notNull(), // requested | ready | expired | done | withdrawn
    /** Exports: the file in storage while it can be downloaded. */
    fileKey: text('file_key'),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Deletions: when it happens (null on older requests: 7 days after `createdAt`). */
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    /** Deletions: what it's waiting for (`DeletionBlocker`). */
    blockedReason: text('blocked_reason'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('privacy_requests_user_idx').on(t.userId, t.kind), index('privacy_requests_status_idx').on(t.kind, t.status)],
);

/**
 * Email addresses we stop sending notification email to: a permanent bounce or a spam complaint reported by
 * the email provider's webhook (blueprint 09 §3). Sign-in codes still go out (the person is asking for one).
 */
export const emailSuppressions = pgTable('email_suppressions', {
  /** Lowercase. */
  email: text('email').primaryKey(),
  reason: text('reason').notNull(), // bounced | complained
  /** The provider's words, e.g. the bounce message. */
  detail: text('detail').notNull().default(''),
  provider: text('provider').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
