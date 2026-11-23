'use server';

import { refresh } from 'next/cache';
import type { ActionResult, NewSupportRequestInput, RateSupportInput, ReportInput, SupportReplyInput } from '@/contracts';
import { createEmailProvider } from '@/integrations/email';
import { appUrl } from '@/integrations/oauth';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { rateSupportCase } from './ratings';
import { createSupportRequest, replyToSupportCase, reportFromThread, setThreadBlock } from './service';
import { emailSupportTranscript } from './transcripts';
import { reportTarget } from './target-reports';
import { requestNow } from '@/platform/clock';

/** Server Actions behind `/app/support`, a case, and a conversation's Report and Block menu (src/contracts/support.ts). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

export async function createSupportRequestAction(input: NewSupportRequestInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unknown' };
  return createSupportRequest(db, userId, input, await requestNow());
}

export async function replyToSupportCaseAction(caseId: string, input: SupportReplyInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await replyToSupportCase(db, userId, String(caseId), input, await requestNow());
  if (result.ok) refresh();
  return result;
}

export async function reportUserAction(threadId: string, input: ReportInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unknown' };
  return reportFromThread(db, userId, String(threadId), input, await requestNow());
}

export async function blockUserAction(threadId: string, input: { blocked: boolean }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unknown' };
  const result = await setThreadBlock(db, userId, String(threadId), Boolean(input.blocked), await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Report a task, a helper or a review (B-059), bound to the target by the report page. */
export async function reportTargetAction(kind: string, id: string, input: ReportInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unknown' };
  return reportTarget(db, userId, String(kind), String(id), input, await requestNow());
}

/**
 * Rate the help on a case (2026-11-23): the member who opened it, once its live chat ended or it's solved. Bound to the
 * case by the case page; called with the case's id by the Help conversation. Never refreshes the page: the screens keep
 * what was rated, and the chat window reads the conversation again itself.
 */
export async function rateSupportCaseAction(caseId: string, input: RateSupportInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return rateSupportCase(db, userId, String(caseId), input, await requestNow());
}

/** "Email me this conversation" (2026-11-23): the case's conversation to the person's own address (3 a day). */
export async function emailSupportTranscriptAction(caseId: string): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return emailSupportTranscript(db, { email: createEmailProvider(db), appUrl: appUrl() }, userId, String(caseId), await requestNow());
}
