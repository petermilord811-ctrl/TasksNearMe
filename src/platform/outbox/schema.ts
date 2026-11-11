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
  },
  (t) => [index('outbox_events_pending_idx').on(t.dispatchedAt, t.createdAt)],
);
