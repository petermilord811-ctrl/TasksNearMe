import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '../accounts/schema';
import { tasks } from '../tasks/schema';

/**
 * Questions on an open task (completion plan 7.9, Airtasker-style): a verified helper asks, the poster answers
 * on the same row and can pin the answer for everyone. One unanswered question per helper per task. Shown to
 * signed-in members only, never indexed; masked like messages; closed when the task is booked.
 */
export const taskQuestions = pgTable(
  'task_questions',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    askerUserId: text('asker_user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    answerBody: text('answer_body'),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    pinned: boolean('pinned').notNull().default(false),
    status: text('status').notNull().default('visible'), // visible | hidden (staff) | removed
    moderationReason: text('moderation_reason'),
    moderatedByUserId: text('moderated_by_user_id').references(() => users.id),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('task_questions_task_idx').on(t.taskId, t.createdAt),
    index('task_questions_asker_idx').on(t.askerUserId, t.createdAt),
    uniqueIndex('task_questions_one_open_idx').on(t.taskId, t.askerUserId).where(sql`${t.answerBody} is null and ${t.status} = 'visible'`),
  ],
);
