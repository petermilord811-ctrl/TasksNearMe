import { describe, expect, it } from 'vitest';
import { caseResolutions, nextCaseStatuses, queueOf, slaDueAt, staffCaseActions, type StaffCaseFacts } from './staff-domain';

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

  it('offers resolutions without money; rework only for disputes', () => {
    expect(caseResolutions(facts())).toEqual(['no_action', 'rework', 'account_action']);
    expect(caseResolutions(facts({ type: 'report_user' }))).toEqual(['no_action', 'account_action']);
    expect(caseResolutions(facts({ type: 'reward_issue' }))).toEqual(['no_action', 'account_action', 'reward_action']);
  });
});
