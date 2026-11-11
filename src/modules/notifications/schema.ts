import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
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

/** Data export and account deletion requests (handled by support within 30 days). */
export const privacyRequests = pgTable(
  'privacy_requests',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(), // export | deletion
    status: text('status').notNull(), // requested | done | withdrawn
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('privacy_requests_user_idx').on(t.userId, t.kind)],
);
