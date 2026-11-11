/**
 * Shared column helpers for Drizzle schemas. Relative imports only (drizzle-kit loads these files).
 * Conventions (docs/blueprint/08 §1): text ids with a type prefix, money as integer cents,
 * timestamps as timestamptz in UTC, statuses as text.
 */
import { timestamp } from 'drizzle-orm/pg-core';

export const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date().toISOString());

/** Nullable timestamptz returned as an ISO string. */
export const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
