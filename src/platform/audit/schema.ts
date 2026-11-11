import { index, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt } from '../db/columns';

/** Append-only record of staff actions and restricted-data access (docs/blueprint/08 §4). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    at: createdAt(),
    actorId: text('actor_id'),
    actorRole: text('actor_role').notNull(), // staff role, "user" or "system"
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip'),
  },
  (t) => [index('audit_log_target_idx').on(t.targetType, t.targetId), index('audit_log_actor_idx').on(t.actorId)],
);
