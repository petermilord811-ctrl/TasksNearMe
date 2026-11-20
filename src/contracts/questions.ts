import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { ISODateTime } from './common';

/**
 * Questions on an open task (completion plan 7.9, Airtasker-style): a verified helper asks before offering, the
 * poster answers on the same row and pins the answer everyone should read. Signed-in members only, never on a
 * page search engines read; masked like messages; reportable; closed once the task is booked.
 */

const code = (value: FieldErrorCode) => value;

export const TASK_QUESTION_MAX = 500;
export const TASK_ANSWER_MAX = 1000;

export interface TaskQuestionView {
  id: string;
  asker: { displayName: string; initials: string; isYou: boolean };
  body: string;
  answer?: { body: string; answeredAt: ISODateTime };
  pinned: boolean;
  createdAt: ISODateTime;
  /** Staff see hidden questions, marked. */
  moderation?: { status: 'hidden' | 'removed'; reason?: string };
}

/** Why the viewer can't ask. */
export const ASK_BLOCKED_REASONS = ['poster', 'not_helper', 'already_asked', 'closed'] as const;
export type AskBlockedReason = (typeof ASK_BLOCKED_REASONS)[number];

export interface TaskQuestionsData {
  taskId: string;
  /** Pinned answers first, then the newest. */
  questions: TaskQuestionView[];
  /**
   * Questions are closed, on the offers' rule (sweep QA1, QA5): the task was booked, canceled or ended, its window has
   * started (offers close then), or its poster can't use their account. Nobody asks, answers, edits or pins; the
   * questions stay readable.
   */
  closed: boolean;
  viewer: {
    /** The task's poster: answers and pins. */
    isPoster: boolean;
    canAsk: boolean;
    askBlocked?: AskBlockedReason;
    /** A staff member who moderates (trust and safety, support leads, admins): shows hide, remove and restore. */
    isStaff: boolean;
  };
}

export const taskQuestionInputSchema = z.object({
  body: z.string(code('required')).trim().min(5, code('too_short')).max(TASK_QUESTION_MAX, code('too_long')),
});
export type TaskQuestionInput = z.input<typeof taskQuestionInputSchema>;

export const taskAnswerInputSchema = z.object({
  questionId: z.string(code('required')).min(1, code('required')),
  body: z.string(code('required')).trim().min(2, code('too_short')).max(TASK_ANSWER_MAX, code('too_long')),
});
export type TaskAnswerInput = z.input<typeof taskAnswerInputSchema>;

/**
 * - `onAsk`: ok `sent`. Errors: `validation_failed`, `not_allowed` (see `askBlocked`), `rate_limited`.
 * - `onAnswer` (the poster, while not `closed`): ok `sent`. Errors: `validation_failed`, `not_allowed` (closed meanwhile).
 * - `onPin` (the poster, while not `closed`): ok `updated`. Errors: `not_allowed` (closed meanwhile).
 * - `onDelete`: the asker takes back an unanswered question. ok `updated`.
 * - `onModerate`: staff only. ok `updated`. Errors: `limit_reached` on `restore` when the helper has a newer open
 *   question on the task (one open question each): hide or remove that one first.
 *
 * Reports: a question by someone else links `routes.app.report('question', id)`; an answer, for anyone but the poster
 * who wrote it (the asker included), links `routes.app.report('answer', id)` with the question's id (sweep QA3).
 */
export interface TaskQuestionHandlers {
  onAsk: ActionHandler<TaskQuestionInput>;
  onAnswer: ActionHandler<TaskAnswerInput>;
  onPin: ActionHandler<{ questionId: string; pinned: boolean }>;
  onDelete: ActionHandler<{ questionId: string }>;
  onModerate?: ActionHandler<{ questionId: string; action: 'hide' | 'remove' | 'restore'; reason: string }>;
}
