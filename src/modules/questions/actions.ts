'use server';

import { refresh } from 'next/cache';
import type { ActionResult, TaskAnswerInput, TaskQuestionInput } from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { answerTaskQuestion, askTaskQuestion, deleteTaskQuestion, moderateTaskQuestion, pinTaskQuestion, type QuestionViewer } from './service';

/** Server Actions behind the questions on a task (src/contracts/questions.ts). Bound to the task by the page. */

async function questionViewer(): Promise<QuestionViewer | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? { id: viewer.user.id, staff: staffActorOf(viewer.user) } : null;
}

const done = (result: ActionResult) => {
  if (result.ok) refresh();
  return result;
};

export async function askTaskQuestionAction(taskId: string, input: TaskQuestionInput): Promise<ActionResult> {
  const viewer = await questionViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  return done(await askTaskQuestion(db, viewer, String(taskId), input, await requestNow()));
}

export async function answerTaskQuestionAction(taskId: string, input: TaskAnswerInput): Promise<ActionResult> {
  const viewer = await questionViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  return done(await answerTaskQuestion(db, viewer, String(taskId), input, await requestNow()));
}

export async function pinTaskQuestionAction(taskId: string, input: { questionId: string; pinned: boolean }): Promise<ActionResult> {
  const viewer = await questionViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  return done(await pinTaskQuestion(db, viewer, String(taskId), String(input.questionId), Boolean(input.pinned), await requestNow()));
}

export async function deleteTaskQuestionAction(input: { questionId: string }): Promise<ActionResult> {
  const viewer = await questionViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  return done(await deleteTaskQuestion(db, viewer, String(input.questionId), await requestNow()));
}

export async function moderateTaskQuestionAction(input: { questionId: string; action: 'hide' | 'remove' | 'restore'; reason: string }): Promise<ActionResult> {
  const viewer = await questionViewer();
  if (!viewer?.staff) return { ok: false, code: 'not_allowed' };
  return done(await moderateTaskQuestion(db, viewer.staff, String(input.questionId), { action: input.action, reason: input.reason }, await requestNow()));
}
