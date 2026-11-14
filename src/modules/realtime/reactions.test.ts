import { describe, expect, it } from 'vitest';
import { peopleIn, planNotices } from './reactions';
import { presenceOf } from './presence';

describe('live notices for outbox events', () => {
  it('tells a message’s other participants, never the sender, with the thread id only', () => {
    expect(planNotices({ type: 'message.sent', payload: { threadId: 'thr_1', taskId: 'tsk_1', senderUserId: 'usr_jordan', recipientIds: ['usr_maya', 'usr_jordan'] } })).toEqual({
      kind: 'users',
      userIds: ['usr_maya'],
      actorId: 'usr_jordan',
      notice: { type: 'message', thread: 'thr_1' },
    });
    expect(planNotices({ type: 'message.sent', payload: { threadId: 'thr_1', senderUserId: 'usr_jordan', recipientIds: [] } })).toBeNull();
  });

  it('puts a newly posted task on its market’s public stream', () => {
    expect(planNotices({ type: 'task.posted', payload: { taskId: 'tsk_1', marketId: 'mkt_austin', categorySlug: 'yard-cleanup' } })).toEqual({
      kind: 'market',
      marketId: 'mkt_austin',
      taskId: 'tsk_1',
      notice: { type: 'task.posted', task: 'tsk_1' },
    });
  });

  it('refreshes the pages of the people an offer, invite or booking names', () => {
    expect(planNotices({ type: 'offer.submitted', payload: { offerId: 'off_1', taskId: 'tsk_1', helperUserId: 'usr_jordan', posterUserId: 'usr_maya' } })).toEqual({
      kind: 'users',
      userIds: ['usr_jordan', 'usr_maya'],
      notice: { type: 'update', event: 'offer.submitted', offer: 'off_1', task: 'tsk_1' },
    });
    expect(planNotices({ type: 'booking.confirmed', payload: { bookingId: 'bkg_1', taskId: 'tsk_1', posterUserId: 'usr_maya', helperUserId: 'usr_jordan' } })?.notice).toEqual({
      type: 'update',
      event: 'booking.confirmed',
      booking: 'bkg_1',
      task: 'tsk_1',
    });
  });

  it('ignores events no open page shows (emails, privacy, staff-only)', () => {
    for (const type of ['email.delivered', 'email.bounced', 'payment.refund_needed', 'support.safety_report', 'verification.updated']) {
      expect(planNotices({ type, payload: { userId: 'usr_maya', posterUserId: 'usr_maya' } }), type).toBeNull();
    }
  });

  it('finds the accounts a payload names, once each, and nothing that isn’t an account', () => {
    expect(peopleIn({ posterUserId: 'usr_maya', helperUserId: 'usr_jordan', recipientIds: ['usr_maya', 'usr_ana', 42], taskId: 'tsk_1', staffNote: 'usr_hidden' })).toEqual(['usr_maya', 'usr_jordan', 'usr_ana']);
  });
});

describe('presence, coarse on purpose', () => {
  const now = new Date('2026-11-14T18:00:00.000Z');
  it('says now within five minutes, today within a day, and nothing after or when hidden', () => {
    expect(presenceOf(new Date(now.getTime() - 4 * 60_000), true, now)).toBe('now');
    expect(presenceOf(new Date(now.getTime() - 6 * 60_000), true, now)).toBe('today');
    expect(presenceOf(new Date(now.getTime() - 23 * 3_600_000), true, now)).toBe('today');
    expect(presenceOf(new Date(now.getTime() - 25 * 3_600_000), true, now)).toBeUndefined();
    expect(presenceOf(new Date(now.getTime() - 60_000), false, now)).toBeUndefined();
    expect(presenceOf(null, true, now)).toBeUndefined();
    expect(presenceOf(new Date(now.getTime() + 10 * 60_000), true, now)).toBeUndefined();
  });
});
