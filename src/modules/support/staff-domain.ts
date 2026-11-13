import type { AdminCaseActionId, AdminCaseStatusFilter, AdminQueue, CaseResolution, CaseStatus, StaffRole } from '@/contracts';
import type { FeeSchedule } from '@/modules/markets/schema';
import { quoteBreakdown } from '@/modules/payments/fees';

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
  /** The booking the case is about, if any: its status and whether it was paid. */
  booking?: { status: string; paid: boolean };
}

export function staffCaseActions(facts: StaffCaseFacts): AdminCaseActionId[] {
  const work = canWorkCases(facts.roles);
  const lead = isCaseLead(facts.roles);
  const finished = isFinishedStatus(facts.status);
  const actions: AdminCaseActionId[] = [];
  // Taking a case someone else holds is for leads (blueprint 03 §9); anyone who works cases takes a free one.
  if (work && !finished && facts.assigneeId !== facts.viewerId && (facts.assigneeId === null || lead)) actions.push('assign_to_me');
  if (work && !finished && facts.assigneeId && (facts.assigneeId === facts.viewerId || lead)) actions.push('unassign');
  // An escalated case is a lead's to decide: others can't move it back (and then resolve it themselves).
  if (work && !finished && (facts.status !== 'escalated' || lead)) actions.push('set_status');
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
  // Only a lead moves an escalated case on (blueprint 03 §9).
  if (facts.status === 'escalated' && !isCaseLead(facts.roles)) return [];
  const options: CaseStatus[] = [];
  if (facts.waitingOn.poster) options.push('awaiting_poster');
  if (facts.waitingOn.helper) options.push('awaiting_helper');
  options.push('awaiting_support', 'escalated');
  return options.filter((status) => status !== facts.status);
}

/**
 * What a case can be resolved with. Money resolutions need a paid booking: a dispute over submitted work
 * can be released in full, settled at a lower price, or refunded in full; a dispute before the work was
 * submitted can only be refunded in full; requests about a paid booking can get a goodwill refund.
 * (Rework needs the revisit flow, UI-026.)
 */
export function caseResolutions(facts: StaffCaseFacts): CaseResolution[] {
  if (!staffCaseActions(facts).includes('resolve')) return [];
  const queue = queueOf(facts.type);
  const paid = facts.booking?.paid === true;
  const submitted = facts.booking?.status === 'disputed' || facts.booking?.status === 'completion_submitted';
  const live = paid && ['confirmed', 'in_progress', 'completion_submitted', 'disputed'].includes(facts.booking?.status ?? '');
  const options: CaseResolution[] = [];
  if (queue === 'disputes' && paid && submitted) options.push('release_full', 'settle', 'refund_full');
  else if (queue === 'disputes' && live) options.push('no_action', 'refund_full');
  else options.push('no_action');
  if (queue === 'requests' && paid) options.push('goodwill_refund');
  options.push('account_action');
  if (facts.type === 'reward_issue') options.push('reward_action');
  return options;
}

/** Resolutions that move money (they need the booking's charge). */
export const MONEY_RESOLUTIONS: readonly CaseResolution[] = ['release_full', 'settle', 'refund_full', 'goodwill_refund'];

// ---- Money ------------------------------------------------------------------------------------------

/** Refunds a staff member can give per booking without approval (blueprint 08: agents $100, leads $500; finance above $500 needs a second approval). */
const REFUND_LIMITS: Partial<Record<StaffRole, number>> = { support_agent: 10_000, support_lead: 50_000, finance: 50_000 };
export const refundLimitOf = (roles: readonly StaffRole[]) => Math.max(0, ...roles.map((role) => REFUND_LIMITS[role] ?? 0));

/**
 * Who approves a refund someone asked for above their own limit (blueprint 08): a support lead up to $500;
 * above $500 finance (the requester and the approver make the dual approval). Never the requester.
 */
export function canApproveRefund(roles: readonly StaffRole[], amountCents: number): boolean {
  if (roles.includes('finance')) return true;
  return roles.includes('support_lead') && amountCents <= (REFUND_LIMITS.support_lead ?? 0);
}

/** Who hides a review per policy, or shows it again (blueprint 08: leads and trust & safety; admins too). */
export function canModerateReviews(roles: readonly StaffRole[]): boolean {
  return roles.some((role) => role === 'support_lead' || role === 'trust_safety' || role === 'admin');
}

export interface BookingMoneyFacts {
  fees: FeeSchedule;
  /** The agreed task price. */
  priceCents: number;
  /** Captured from the client, and refunded so far. */
  chargedCents: number;
  refundedCents: number;
}

export type ResolutionMoney = { posterRefundCents: number; helperReceivesCents: number; platformKeepsCents: number };

/**
 * What a money resolution does (blueprint 04 §6; the $60 desk charged $66 settled at $45: client refund $16.50,
 * helper $40.50, platform $9.00). `out_of_range`: a settle price not below the agreed price, or a refund
 * larger than what's left. Null: the resolution moves no money.
 */
export function resolutionMoney(
  resolution: CaseResolution,
  money: BookingMoneyFacts,
  input: { settlePriceCents?: number; goodwillCents?: number },
): ResolutionMoney | 'out_of_range' | null {
  const left = money.chargedCents - money.refundedCents;
  const agreed = quoteBreakdown(money.fees, { type: 'fixed', priceCents: money.priceCents });
  switch (resolution) {
    case 'release_full':
      return { posterRefundCents: 0, helperReceivesCents: agreed.helperEarningsCents, platformKeepsCents: agreed.platformRevenueCents };
    case 'settle': {
      const price = input.settlePriceCents ?? 0;
      if (price <= 0 || price >= money.priceCents) return 'out_of_range';
      const settled = quoteBreakdown(money.fees, { type: 'fixed', priceCents: price });
      const refund = agreed.posterTotalCents - settled.posterTotalCents;
      if (refund > left) return 'out_of_range';
      return { posterRefundCents: refund, helperReceivesCents: settled.helperEarningsCents, platformKeepsCents: settled.platformRevenueCents };
    }
    case 'refund_full':
      return { posterRefundCents: left, helperReceivesCents: 0, platformKeepsCents: 0 };
    case 'goodwill_refund': {
      const amount = input.goodwillCents ?? 0;
      if (amount <= 0 || amount > left) return 'out_of_range';
      return { posterRefundCents: amount, helperReceivesCents: agreed.helperEarningsCents, platformKeepsCents: agreed.platformRevenueCents - amount };
    }
    default:
      return null;
  }
}

// ---- Saved replies ------------------------------------------------------------------------------

/** Leads write, edit and archive saved replies; anyone who works cases uses them. */
export const canManageSavedReplies = (roles: readonly StaffRole[]) => isCaseLead(roles);

/**
 * Fills `{first_name}` and `{staff_name}` (spaces inside the braces allowed, any case) when a reply is
 * sent, from a saved reply or typed by hand. Anything else in braces stays as written.
 */
export function fillReplyPlaceholders(body: string, values: { first_name: string; staff_name: string }): string {
  return body.replace(/\{\s*(first_name|staff_name)\s*\}/gi, (_match, name: string) => values[name.toLowerCase() as keyof typeof values]);
}

// ---- Response times -----------------------------------------------------------------------------

export interface ResponseCaseFacts {
  queue: AdminQueue;
  status: CaseStatus;
  createdAt: Date;
  firstResponseAt: Date | null;
}

const HOUR_MS = 3_600_000;

/**
 * One queue's numbers against its targets: what waits on staff now (past due, due within the hour), and
 * the last 7 days' first replies (on time out of those that were due: sent, or past the target unsent).
 */
export function queueResponseStats(queue: AdminQueue, cases: readonly ResponseCaseFacts[], now: Date) {
  const mine = cases.filter((item) => item.queue === queue);
  let waitingOnStaff = 0;
  let pastDue = 0;
  let dueSoon = 0;
  for (const item of mine) {
    if (!STATUS_FILTERS.active!.includes(item.status)) continue;
    waitingOnStaff += 1;
    const due = slaDueAt(item);
    if (!due) continue;
    if (due <= now) pastDue += 1;
    else if (due.getTime() - now.getTime() <= HOUR_MS) dueSoon += 1;
  }
  const target = FIRST_RESPONSE_HOURS[queue] * HOUR_MS;
  const week = mine.filter((item) => now.getTime() - item.createdAt.getTime() <= 7 * 24 * HOUR_MS);
  const replyMinutes = week.flatMap((item) => (item.firstResponseAt ? [(item.firstResponseAt.getTime() - item.createdAt.getTime()) / 60_000] : [])).sort((a, b) => a - b);
  const due = week.filter((item) => item.firstResponseAt || now.getTime() - item.createdAt.getTime() > target);
  const onTime = week.filter((item) => item.firstResponseAt && item.firstResponseAt.getTime() - item.createdAt.getTime() <= target);
  const middle = replyMinutes.length === 0 ? undefined : replyMinutes.length % 2 === 1 ? replyMinutes[(replyMinutes.length - 1) / 2]! : (replyMinutes[replyMinutes.length / 2 - 1]! + replyMinutes[replyMinutes.length / 2]!) / 2;
  return {
    queue,
    firstReplyHours: FIRST_RESPONSE_HOURS[queue],
    waitingOnStaff,
    pastDue,
    dueSoon,
    week: { opened: week.length, due: due.length, onTime: onTime.length, ...(middle !== undefined ? { medianFirstReplyMinutes: Math.round(middle) } : {}) },
  };
}
