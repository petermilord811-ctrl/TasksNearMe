import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * The webhook inbox (blueprint 09 §4.2; completion plan 5.11). Every signed event from a provider is recorded
 * once, by the provider's event id: a redelivery of a processed event is acknowledged without running again,
 * a failure is kept with its payload and retried with backoff, and after the last try it's `dead`: staff see
 * it on /admin/webhooks and can replay it. The payload is kept only while the event is failed or dead.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(), // stripe | checkr | resend
    eventId: text('event_id').notNull(),
    type: text('type').notNull().default(''),
    /** SHA-256 of the body as received. */
    payloadHash: text('payload_hash').notNull(),
    /** The body as received, while failed or dead (cleared once processed). */
    payload: text('payload'),
    /** processed | ignored | failed | dead */
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    /** `failed`: when the retry job tries again. */
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('webhook_events_provider_event_idx').on(t.provider, t.eventId),
    index('webhook_events_retry_idx').on(t.status, t.nextAttemptAt),
    index('webhook_events_status_received_idx').on(t.status, t.receivedAt),
  ],
);
