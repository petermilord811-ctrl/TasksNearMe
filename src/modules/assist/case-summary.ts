import type { AdminCaseActor, AdminCaseEventView, AdminCasePageData, AdminCaseSummary, AiAssistResult } from '@/contracts';
import type { CaseFacts, CaseSummarizer } from '@/integrations/ai/case-summarizer';
import { getFlags } from '@/modules/markets/queries';
import { getAdminCase, type StaffActor } from '@/modules/support/staff';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import type { Db } from '@/platform/db/connect';
import { formatMoney } from '@/shared/format';
import { asAiResult, NOT_FOUND, overLimit, UNAVAILABLE } from './ai-run';

/**
 * "Summarize with AI" on a support case (2026-11-24; src/contracts/ai-assist.ts): the case exactly as the page shows
 * this staff member (`getAdminCase`, with its access rules), never the restricted conversation, which takes a logged
 * reason to open. Summaries are saved nowhere. AI's global switch (`ai_drafting`) turns it off for staff too.
 */

/** Summaries per staff member an hour. */
export const CASE_SUMMARY_RULE = { limit: 60, windowSeconds: 60 * 60 };

function actorName(actor: AdminCaseActor): string {
  switch (actor.kind) {
    case 'member':
      return actor.person.displayName;
    case 'staff':
      return `support (${actor.staff.displayName})`;
    case 'contact':
      return 'the contact';
    case 'assistant':
      return 'the AI assistant';
    case 'system':
      return 'the system';
  }
}

function eventLine(event: AdminCaseEventView, parties: Map<string, string>): string {
  const who = actorName(event.actor);
  const body = event.body ? `: ${maskContactDetails(event.body).text}` : '';
  switch (event.kind) {
    case 'message':
      return event.actor.kind === 'staff' ? `${who} wrote to ${event.partyId ? (parties.get(event.partyId) ?? 'a party') : 'the contact'}${body}` : `${who} wrote to support${body}`;
    case 'note':
      return `staff note by ${who}${body}`;
    case 'status':
      return `${who} set the status to ${event.status ?? 'unknown'}`;
    case 'assignment':
      return event.assignee ? `assigned to ${event.assignee.displayName}` : 'unassigned';
    case 'resolution':
      return `${who} resolved it: ${event.resolution ?? ''}${body}`;
    case 'review':
      return `${who} ${event.reviewAction ?? 'changed'} the reported review${body}`;
    case 'question':
      return `${who} ${event.questionAction ?? 'changed'} the reported question${body}`;
    case 'live':
      return event.live === 'joined' ? `${who} joined the live chat` : 'the live chat ended';
    case 'rating':
      return `${who} rated the help ${event.rating ?? ''}${body}`;
  }
}

/** The case as the summary reads it: who, what, and what happened, oldest first. */
export function caseFactsOf(data: AdminCasePageData): CaseFacts {
  const parties = new Map(data.parties.map((party) => [party.person.id, `${party.role} ${party.person.displayName}`]));
  const reported = data.review
    ? `a review (${data.review.review.rating} stars) of ${data.review.subject.displayName}: ${data.review.review.body ?? '(no words)'}`
    : data.question
      ? `a question on a task: ${JSON.stringify(data.question).slice(0, 600)}`
      : data.thanks
        ? `a thank-you note: ${JSON.stringify(data.thanks).slice(0, 600)}`
        : data.groupMessage
          ? `a group message: ${JSON.stringify(data.groupMessage).slice(0, 600)}`
          : data.post
            ? `a Neighbors ${data.post.replyId ? 'reply' : 'post'} titled "${data.post.title}"`
            : undefined;
  return {
    type: data.case.type,
    ...(data.case.reason ? { reason: data.case.reason } : {}),
    subject: data.case.subject,
    status: data.case.status,
    description: maskContactDetails(data.case.description).text,
    parties: data.parties.map((party) => `${party.role}: ${party.person.displayName}`),
    ...(data.booking ? { booking: `${data.booking.title}, ${data.booking.status}, ${data.booking.start.slice(0, 10)}, ${formatMoney(data.booking.priceCents)}` } : {}),
    events: data.events.map((event) => eventLine(event, parties)),
    ...(reported ? { reported: maskContactDetails(reported).text } : {}),
    ...(data.case.resolution ? { resolution: `${data.case.resolution.type}: ${maskContactDetails(data.case.resolution.summary).text}` } : {}),
  };
}

export async function summarizeSupportCase(
  { db, summarizer, now }: { db: Db; summarizer: CaseSummarizer | null; now: Date },
  staff: StaffActor,
  caseId: string,
): Promise<AiAssistResult<AdminCaseSummary>> {
  if (!summarizer || !(await getFlags('global', db)).ai_drafting) return UNAVAILABLE;
  const found = await getAdminCase(db, staff, String(caseId), now);
  if (!found) return NOT_FOUND;
  const limited = await overLimit(db, `assist:case:${staff.id}`, CASE_SUMMARY_RULE, now);
  if (limited) return limited;
  const facts = caseFactsOf(found.data);
  return asAiResult('assist-case', 'form', async () => {
    const summary = await summarizer.summarize(facts);
    const clean = (lines: string[]) => lines.map((line) => maskContactDetails(line).text);
    return { points: clean(summary.points), open: clean(summary.open) };
  });
}
