import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
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
    /**
     * The short link a text message carries in place of the page's address (messages pass J-M9): 10 characters from a
     * CSPRNG (base62, about 60 bits), made on the first text, gone with the notification. /n/<code> redirects to the
     * page in the recipient's language, which still asks for sign-in.
     */
    shortCode: text('short_code'),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('notifications_event_user_idx').on(t.sourceEventId, t.userId),
    uniqueIndex('notifications_short_code_idx').on(t.shortCode),
  ],
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

/**
 * Devices that turned notifications on (Web Push; src/integrations/push): one row per browser
 * subscription. A subscription the push service says is gone is deleted; signing in as someone else in
 * the same browser moves it to them.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('push_subscriptions_endpoint_idx').on(t.endpoint), index('push_subscriptions_user_idx').on(t.userId)],
);

/**
 * A person's own quiet hours (2026-11-24, owner's list: "quiet hours for helpers"): optional, off until they turn it on.
 * `starts_at` and `ends_at` are wall-clock times ("21:00", "08:00") on their home market's clock (`markets.time_zone`),
 * so a window may cross midnight. While it's on and the time is inside it, "sent you a message" notifications reach
 * only the app (no push, text or email) unless the conversation is a booking's on its day or within 12 hours; nothing
 * held is sent later (delivery.ts, quiet-hours.ts). The times stay when it's turned off, for turning it on again.
 */
export const notificationQuietHours = pgTable('notification_quiet_hours', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
