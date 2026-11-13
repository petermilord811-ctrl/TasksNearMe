import { describe, expect, it } from 'vitest';
import { canManageSavedReplies, caseResolutions, fillReplyPlaceholders, nextCaseStatuses, queueOf, queueResponseStats, refundLimitOf, resolutionMoney, slaDueAt, staffCaseActions, type BookingMoneyFacts, type ResponseCaseFacts, type StaffCaseFacts } from './staff-domain';

const facts = (over: Partial<StaffCaseFacts> = {}): StaffCaseFacts => ({
  roles: ['support_agent'],
  viewerId: 'usr_alex',
  type: 'dispute',
  status: 'open',
  assigneeId: null,
  waitingOn: { poster: true, helper: true },
  ...over,
});

describe('queues and response targets', () => {
  it('sorts case types into queues; unknown types are requests', () => {
    expect(['dispute', 'no_show', 'safety', 'report_user', 'payment_issue', 'request', 'something_new'].map(queueOf)).toEqual([
      'disputes',
      'disputes',
      'safety',
      'reports',
      'requests',
      'requests',
      'requests',
    ]);
  });

  it('wants a first reply within 4 h for disputes and 24 h for requests, then a resolution within 72 h', () => {
    const createdAt = new Date('2026-11-22T15:00:00.000Z');
    expect(slaDueAt({ queue: 'disputes', status: 'open', createdAt, firstResponseAt: null })?.toISOString()).toBe('2026-11-22T19:00:00.000Z');
    expect(slaDueAt({ queue: 'requests', status: 'open', createdAt, firstResponseAt: null })?.toISOString()).toBe('2026-11-23T15:00:00.000Z');
    expect(slaDueAt({ queue: 'disputes', status: 'awaiting_support', createdAt, firstResponseAt: createdAt })?.toISOString()).toBe('2026-11-25T15:00:00.000Z');
  });

  it('has no target while waiting on a member or once resolved', () => {
    const createdAt = new Date('2026-11-22T15:00:00.000Z');
    for (const status of ['awaiting_poster', 'awaiting_helper', 'resolved', 'closed'] as const) {
      expect(slaDueAt({ queue: 'safety', status, createdAt, firstResponseAt: null })).toBeUndefined();
    }
  });
});

describe('what staff can do on a case', () => {
  it('lets an agent take, reply, note, move and resolve an open case', () => {
    expect(staffCaseActions(facts())).toEqual(['assign_to_me', 'set_status', 'reply', 'add_note', 'resolve']);
    expect(staffCaseActions(facts({ assigneeId: 'usr_alex' }))).toEqual(['unassign', 'set_status', 'reply', 'add_note', 'resolve']);
  });

  it('lets only leads take a case from someone else, decide escalated cases, and reopen', () => {
    expect(staffCaseActions(facts({ assigneeId: 'usr_morgan' }))).not.toContain('unassign');
    expect(staffCaseActions(facts({ assigneeId: 'usr_morgan' }))).not.toContain('assign_to_me');
    expect(staffCaseActions(facts({ roles: ['support_lead'], assigneeId: 'usr_alex', viewerId: 'usr_morgan' }))).toContain('assign_to_me');
    // An agent can't move an escalated case back to support and then resolve it.
    expect(staffCaseActions(facts({ status: 'escalated' }))).not.toContain('set_status');
    expect(nextCaseStatuses(facts({ status: 'escalated' }))).toEqual([]);
    expect(nextCaseStatuses(facts({ roles: ['support_lead'], status: 'escalated' }))).toEqual(['awaiting_poster', 'awaiting_helper', 'awaiting_support']);
    expect(staffCaseActions(facts({ roles: ['support_lead'], assigneeId: 'usr_alex' }))).toContain('unassign');
    expect(staffCaseActions(facts({ status: 'escalated' }))).not.toContain('resolve');
    expect(staffCaseActions(facts({ roles: ['trust_safety'], status: 'escalated' }))).toContain('resolve');
    expect(staffCaseActions(facts({ status: 'resolved' }))).toEqual(['reply', 'add_note', 'close']);
    expect(staffCaseActions(facts({ roles: ['support_lead'], status: 'closed' }))).toEqual(['add_note', 'reopen']);
  });

  it('leaves finance with notes only', () => {
    const finance = facts({ roles: ['finance'] });
    expect(staffCaseActions(finance)).toEqual(['add_note']);
    expect(nextCaseStatuses(finance)).toEqual([]);
    expect(caseResolutions(finance)).toEqual([]);
  });

  it('offers the waiting statuses that fit the people on the case', () => {
    expect(nextCaseStatuses(facts())).toEqual(['awaiting_poster', 'awaiting_helper', 'awaiting_support', 'escalated']);
    expect(nextCaseStatuses(facts({ status: 'awaiting_support', waitingOn: { poster: true, helper: false } }))).toEqual(['awaiting_poster', 'escalated']);
  });

  it('offers money resolutions only for cases about a paid booking', () => {
    expect(caseResolutions(facts({ booking: { status: 'disputed', paid: true } }))).toEqual(['release_full', 'settle', 'refund_full', 'account_action']);
    expect(caseResolutions(facts({ booking: { status: 'confirmed', paid: true } }))).toEqual(['no_action', 'refund_full', 'account_action']);
    expect(caseResolutions(facts())).toEqual(['no_action', 'account_action']);
    expect(caseResolutions(facts({ type: 'payment_issue', booking: { status: 'completed', paid: true } }))).toEqual(['no_action', 'goodwill_refund', 'account_action']);
    expect(caseResolutions(facts({ type: 'report_user' }))).toEqual(['no_action', 'account_action']);
    expect(caseResolutions(facts({ type: 'reward_issue' }))).toEqual(['no_action', 'account_action', 'reward_action']);
  });
});

describe('the money a resolution moves', () => {
  // The $60 desk charged $66 (blueprint 04 §6).
  const desk: BookingMoneyFacts = { fees: { posterBps: 1000, posterMinCents: 300, helperBps: 1000 }, priceCents: 6000, chargedCents: 6600, refundedCents: 0 };

  it('settles at $45: $16.50 back to the client, $40.50 to the helper, $9.00 kept', () => {
    expect(resolutionMoney('settle', desk, { settlePriceCents: 4500 })).toEqual({ posterRefundCents: 1650, helperReceivesCents: 4050, platformKeepsCents: 900 });
    expect(resolutionMoney('settle', desk, { settlePriceCents: 6000 })).toBe('out_of_range');
  });

  it('releases in full, refunds in full, or refunds goodwill from platform funds', () => {
    expect(resolutionMoney('release_full', desk, {})).toEqual({ posterRefundCents: 0, helperReceivesCents: 5400, platformKeepsCents: 1200 });
    expect(resolutionMoney('refund_full', { ...desk, refundedCents: 600 }, {})).toEqual({ posterRefundCents: 6000, helperReceivesCents: 0, platformKeepsCents: 0 });
    expect(resolutionMoney('goodwill_refund', desk, { goodwillCents: 2000 })).toEqual({ posterRefundCents: 2000, helperReceivesCents: 5400, platformKeepsCents: -800 });
    expect(resolutionMoney('goodwill_refund', desk, { goodwillCents: 7000 })).toBe('out_of_range');
    expect(resolutionMoney('no_action', desk, {})).toBeNull();
  });

  it('limits refunds per booking by role', () => {
    expect(refundLimitOf(['support_agent'])).toBe(10_000);
    expect(refundLimitOf(['support_agent', 'support_lead'])).toBe(50_000);
    expect(refundLimitOf(['trust_safety'])).toBe(0);
  });
});

describe('saved replies', () => {
  it('fills the first name and the staff name, however the braces are spaced, and leaves the rest', () => {
    const body = 'Hi {first_name},\n\nThanks, { Staff_Name }. {first_name} again. {booking_id} stays.';
    expect(fillReplyPlaceholders(body, { first_name: 'Maya', staff_name: 'Alex' })).toBe('Hi Maya,\n\nThanks, Alex. Maya again. {booking_id} stays.');
    expect(fillReplyPlaceholders('No placeholders.', { first_name: 'Maya', staff_name: 'Alex' })).toBe('No placeholders.');
  });

  it('lets leads keep the list', () => {
    expect(canManageSavedReplies(['support_agent'])).toBe(false);
    expect(canManageSavedReplies(['finance'])).toBe(false);
    expect(canManageSavedReplies(['support_lead'])).toBe(true);
    expect(canManageSavedReplies(['trust_safety'])).toBe(true);
    expect(canManageSavedReplies(['admin'])).toBe(true);
  });
});

describe('response times', () => {
  const now = new Date('2026-11-23T16:00:00.000Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
  const item = (over: Partial<ResponseCaseFacts>): ResponseCaseFacts => ({ queue: 'disputes', status: 'open', createdAt: hoursAgo(1), firstResponseAt: null, ...over });

  it('counts what waits on staff now: past due and due within the hour', () => {
    const stats = queueResponseStats('disputes', [
      item({ createdAt: hoursAgo(5) }), // first reply was due an hour ago
      item({ createdAt: hoursAgo(3.5) }), // due in 30 minutes
      item({ createdAt: hoursAgo(1) }), // due in 3 hours
      item({ status: 'awaiting_poster', createdAt: hoursAgo(10) }), // waits on a member: nothing due
      item({ status: 'resolved', createdAt: hoursAgo(10) }),
      item({ queue: 'safety', createdAt: hoursAgo(5) }), // another queue
    ], now);
    expect(stats).toMatchObject({ queue: 'disputes', firstReplyHours: 4, waitingOnStaff: 3, pastDue: 1, dueSoon: 1 });
  });

  it('rates the last 7 days: on time out of the first replies that were due, and the middle reply time', () => {
    const stats = queueResponseStats('reports', [
      item({ queue: 'reports', status: 'resolved', createdAt: hoursAgo(48), firstResponseAt: hoursAgo(46) }), // 2 h: on time
      item({ queue: 'reports', status: 'resolved', createdAt: hoursAgo(100), firstResponseAt: hoursAgo(70) }), // 30 h: late
      item({ queue: 'reports', createdAt: hoursAgo(30) }), // no reply, past 24 h: due, late
      item({ queue: 'reports', createdAt: hoursAgo(2) }), // no reply, still within 24 h: not due yet
      item({ queue: 'reports', status: 'closed', createdAt: hoursAgo(24 * 8), firstResponseAt: hoursAgo(24 * 8 - 1) }), // older than a week
    ], now);
    expect(stats.week).toEqual({ opened: 4, due: 3, onTime: 1, medianFirstReplyMinutes: 960 });
    expect(queueResponseStats('safety', [], now).week).toEqual({ opened: 0, due: 0, onTime: 0 });
  });
});
