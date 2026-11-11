import { index, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt } from '../db/columns';

/**
 * Email and SMS sent by the fake providers (development and tests). Shown at /dev/outbox.
 * Real providers (Postmark, Twilio) never write here.
 */
export const devOutboxMessages = pgTable(
  'dev_outbox_messages',
  {
    id: text('id').primaryKey(),
    channel: text('channel').notNull(), // email | sms
    to: text('to').notNull(),
    subject: text('subject').notNull().default(''),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('dev_outbox_to_idx').on(t.to, t.createdAt)],
);
