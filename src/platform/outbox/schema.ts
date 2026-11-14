import { index, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, tsz } from '../db/columns';

/**
 * Domain events written in the same transaction as the state change (docs/blueprint/09 §5).
 * A dispatcher job publishes them; consumers are idempotent.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    dispatchedAt: tsz('dispatched_at'),
    /**
     * When a dispatcher took the event (FOR NO KEY UPDATE SKIP LOCKED, src/modules/notifications/service.ts), so
     * two never handle the same one. A claim older than a few minutes is taken again: still at least once.
     */
    claimedAt: tsz('claimed_at'),
  },
  (t) => [index('outbox_events_pending_idx').on(t.dispatchedAt, t.createdAt)],
);
