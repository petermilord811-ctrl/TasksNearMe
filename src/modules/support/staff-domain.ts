import type { AdminCaseActionId, AdminCaseStatusFilter, AdminQueue, CaseResolution, CaseStatus, StaffRole } from '@/contracts';

/**
 * Pure rules for staff working support cases (blueprint 03 §9, 08 staff access). The UI shows what
 * these return; it never decides.
 */

export function queueOf(type: string): AdminQueue {
  if (type === 'dispute' || type === 'no_show' || type === 'cancellation_review') return 'disputes';
  if (type === 'safety') return 'safety';
  if (type === 'report_user' || type === 'report_content') return 'reports';
  return 'requests';
}

export const QUEUE_TYPES: Record<AdminQueue, string[]> = {
  disputes: ['dispute', 'no_show', 'cancellation_review'],
  safety: ['safety'],
  reports: ['report_user', 'report_content'],
  requests: ['payment_issue', 'reward_issue', 'account', 'request'],
};

export const STATUS_FILTERS: Record<AdminCaseStatusFilter, CaseStatus[] | null> = {
  active: ['open', 'awaiting_support', 'escalated'],
  waiting: ['awaiting_poster', 'awaiting_helper'],
  finished: ['resolved', 'closed'],
  all: null,
};

export const isFinishedStatus = (status: CaseStatus) => status === 'resolved' || status === 'closed';

/** Staff who work cases. Finance and everyone else can read cases and add notes. */
const WORKERS: readonly StaffRole[] = ['support_agent', 'support_lead', 'trust_safety', 'admin'];
/** Staff who decide escalated cases, take cases from others, and reopen (blueprint 03 §9). */
const LEADS: readonly StaffRole[] = ['support_lead', 'trust_safety', 'admin'];

export const canWorkCases = (roles: readonly StaffRole[]) => roles.some((role) => WORKERS.includes(role));
export const isCaseLead = (roles: readonly StaffRole[]) => roles.some((role) => LEADS.includes(role));

/**
 * Response targets, counted in clock hours until a business calendar exists: the first staff reply
 * (disputes and safety 4 h, the rest 24 h), then a resolution 72 h after opening. Nothing is due
 * while the case waits on a member, or once it is resolved.
 */
export const FIRST_RESPONSE_HOURS: Record<AdminQueue, number> = { disputes: 4, safety: 4, reports: 24, requests: 24 };
export const RESOLUTION_HOURS = 72;

export function slaDueAt(input: { queue: AdminQueue; status: CaseStatus; createdAt: Date; firstResponseAt: Date | null }): Date | undefined {
  if (isFinishedStatus(input.status) || input.status === 'awaiting_poster' || input.status === 'awaiting_helper') return undefined;
  const hours = input.firstResponseAt ? RESOLUTION_HOURS : FIRST_RESPONSE_HOURS[input.queue];
  return new Date(input.createdAt.getTime() + hours * 3_600_000);
}

export interface StaffCaseFacts {
  roles: readonly StaffRole[];
  viewerId: string;
  type: string;
  status: CaseStatus;
  assigneeId: string | null;
  /** Which "waiting on" statuses fit: the people staff can write to on this case. */
  waitingOn: { poster: boolean; helper: boolean };
}

export function staffCaseActions(facts: StaffCaseFacts): AdminCaseActionId[] {
  const work = canWorkCases(facts.roles);
  const lead = isCaseLead(facts.roles);
  const finished = isFinishedStatus(facts.status);
  const actions: AdminCaseActionId[] = [];
  if (work && !finished && facts.assigneeId !== facts.viewerId) actions.push('assign_to_me');
  if (work && !finished && facts.assigneeId && (facts.assigneeId === facts.viewerId || lead)) actions.push('unassign');
  if (work && !finished) actions.push('set_status');
  if (work && facts.status !== 'closed') actions.push('reply');
  actions.push('add_note');
  if (work && !finished && (facts.status !== 'escalated' || lead)) actions.push('resolve');
  if (work && facts.status === 'resolved') actions.push('close');
  if (lead && finished) actions.push('reopen');
  return actions;
}

/** Where a case can move by hand: wait on a person, back to support, or up to a lead. */
export function nextCaseStatuses(facts: StaffCaseFacts): CaseStatus[] {
  if (!canWorkCases(facts.roles) || isFinishedStatus(facts.status)) return [];
  const options: CaseStatus[] = [];
  if (facts.waitingOn.poster) options.push('awaiting_poster');
  if (facts.waitingOn.helper) options.push('awaiting_helper');
  options.push('awaiting_support', 'escalated');
  return options.filter((status) => status !== facts.status);
}

/** Resolutions without money effects (money resolutions come with the payments tools, UI-019). */
export function caseResolutions(facts: StaffCaseFacts): CaseResolution[] {
  if (!staffCaseActions(facts).includes('resolve')) return [];
  const queue = queueOf(facts.type);
  const options: CaseResolution[] = ['no_action'];
  if (queue === 'disputes') options.push('rework');
  options.push('account_action');
  if (facts.type === 'reward_issue') options.push('reward_action');
  return options;
}
