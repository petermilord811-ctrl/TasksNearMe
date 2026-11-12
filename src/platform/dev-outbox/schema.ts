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
    /** The HTML version of an email, when it has one (shown in a frame at /dev/outbox). */
    html: text('html'),
    /** What kind of email it is (Postmark's tag), e.g. `welcome` or `sign-in-code`. */
    tag: text('tag'),
    createdAt: createdAt(),
  },
  (t) => [index('dev_outbox_to_idx').on(t.to, t.createdAt)],
);
