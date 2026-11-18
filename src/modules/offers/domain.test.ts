import { describe, expect, it } from 'vitest';
import { deskOfferLee } from '@/fixtures';
import { toMessageSegments } from '@/modules/trust/message-segments';
import { byAttention, ownerTaskAttention, posterOfferActions, taskOwnerActions, type OwnerTaskFacts } from './domain';

const now = new Date('2026-11-17T15:00:00.000Z');
const openTask = { status: 'open', windowEnd: new Date('2026-11-21T19:00:00.000Z') };

describe('poster offer actions', () => {
  it('book, message, and decline a pending offer', () => {
    expect(posterOfferActions({ status: 'pending' }, openTask, now).map((a) => [a.id, a.enabled])).toEqual([
      ['book_offer', true],
      ['message_helper', true],
      ['decline_offer', true],
    ]);
  });

  it('a stale offer waits for the helper', () => {
    const book = posterOfferActions({ status: 'stale' }, openTask, now)[0];
    expect(book).toEqual({ id: 'book_offer', kind: 'primary', enabled: false, disabledReason: { code: 'awaiting_other_party' } });
  });

  it('nothing once the task is booked or its window has passed, or for closed offers', () => {
    expect(posterOfferActions({ status: 'pending' }, { ...openTask, status: 'assigned' }, now)).toEqual([]);
    expect(posterOfferActions({ status: 'pending' }, { ...openTask, windowEnd: new Date('2026-11-17T14:00:00.000Z') }, now)).toEqual([]);
    expect(posterOfferActions({ status: 'declined' }, openTask, now)).toEqual([]);
    expect(posterOfferActions({ status: 'withdrawn' }, openTask, now)).toEqual([]);
  });

  it('an expired offer on a task still open: ask the helper again, directly (audit M31)', () => {
    expect(posterOfferActions({ status: 'expired' }, openTask, now)).toEqual([{ id: 'request_helper', kind: 'secondary', enabled: true }]);
    expect(posterOfferActions({ status: 'expired' }, { ...openTask, status: 'canceled' }, now)).toEqual([]);
    expect(posterOfferActions({ status: 'expired' }, { ...openTask, windowEnd: new Date('2026-11-17T14:00:00.000Z') }, now)).toEqual([]);
  });
});

describe('task owner actions', () => {
  it('follow the task status', () => {
    expect(taskOwnerActions({ status: 'open' }).map((a) => a.id)).toEqual(['invite_helpers', 'cancel_task']);
    expect(taskOwnerActions({ status: 'assigned' })).toEqual([]);
    expect(taskOwnerActions({ status: 'expired' }).map((a) => a.id)).toEqual(['post_again']);
  });
});

describe('message segments', () => {
  it('masks phones and emails before booking, keeping a phone hint', () => {
    expect(toMessageSegments('Can do Saturday late morning. Text me at 512-555-0134 if anything changes.', { mask: true })).toEqual(
      deskOfferLee.message,
    );
    expect(toMessageSegments('Mail lee.m@example.com or lee at example dot com', { mask: true })).toEqual([
      { kind: 'text', text: 'Mail ' },
      { kind: 'masked', detail: 'email' },
      { kind: 'text', text: ' or ' },
      { kind: 'masked', detail: 'email' },
    ]);
  });

  it('shows the text as written after booking, and leaves ordinary numbers alone', () => {
    expect(toMessageSegments('Call 512-555-0134', { mask: false })).toEqual([{ kind: 'text', text: 'Call 512-555-0134' }]);
    expect(toMessageSegments('About 40 parts, 2nd floor, $60.', { mask: true })).toEqual([
      { kind: 'text', text: 'About 40 parts, 2nd floor, $60.' },
    ]);
  });
});

describe("what needs the poster", () => {
  const now = new Date('2026-11-17T15:00:00.000Z');
  const task: OwnerTaskFacts = {
    status: 'open',
    windowStart: new Date('2026-11-21T16:00:00.000Z'),
    windowEnd: new Date('2026-11-21T19:00:00.000Z'),
    postedAt: new Date('2026-11-16T15:00:00.000Z'),
    activeOfferCount: 2,
    newOfferCount: 0,
  };
  const booking = { id: 'bkg_1', status: 'confirmed', fundingExpiresAt: null, approvalDueAt: null };

  it('puts the booking\'s own steps first', () => {
    const hold = new Date('2026-11-17T15:20:00.000Z');
    expect(ownerTaskAttention({ ...task, newOfferCount: 1, booking: { ...booking, status: 'pending_funding', fundingExpiresAt: hold } }, now)).toEqual({ kind: 'finish_payment', bookingId: 'bkg_1', dueAt: hold.toISOString() });
    // An unpaid hold that already ran out is not something to finish.
    expect(ownerTaskAttention({ ...task, booking: { ...booking, status: 'pending_funding', fundingExpiresAt: new Date('2026-11-17T14:00:00.000Z') } }, now)).toBeUndefined();
    const due = new Date('2026-11-19T15:00:00.000Z');
    expect(ownerTaskAttention({ ...task, status: 'assigned', booking: { ...booking, status: 'completion_submitted', approvalDueAt: due } }, now)).toEqual({ kind: 'review_work', bookingId: 'bkg_1', dueAt: due.toISOString() });
    expect(ownerTaskAttention({ ...task, status: 'assigned', booking }, now)).toBeUndefined();
  });

  it('asks to choose when offers wait and the task is within a day, then for new offers, then for helpers', () => {
    const soon = { ...task, windowStart: new Date('2026-11-18T14:00:00.000Z'), windowEnd: new Date('2026-11-18T17:00:00.000Z') };
    expect(ownerTaskAttention({ ...soon, newOfferCount: 1 }, now)).toEqual({ kind: 'choose_soon', dueAt: '2026-11-18T17:00:00.000Z' });
    expect(ownerTaskAttention({ ...task, newOfferCount: 1 }, now)).toEqual({ kind: 'new_offers' });
    expect(ownerTaskAttention(task, now)).toBeUndefined();
    expect(ownerTaskAttention({ ...task, activeOfferCount: 0 }, now)).toEqual({ kind: 'no_offers' });
    // Less than a day old: give it time.
    expect(ownerTaskAttention({ ...task, activeOfferCount: 0, postedAt: new Date('2026-11-17T09:00:00.000Z') }, now)).toBeUndefined();
    // Closed tasks need nothing.
    expect(ownerTaskAttention({ ...task, status: 'expired', activeOfferCount: 0 }, now)).toBeUndefined();
    expect(ownerTaskAttention({ ...soon, windowEnd: new Date('2026-11-17T14:00:00.000Z') }, now)).toBeUndefined();
  });

  it('orders by urgency, then by time', () => {
    const row = (kind: 'review_work' | 'new_offers' | 'no_offers', at: string) => ({ attention: { kind, dueAt: at }, schedule: { windowStart: at, windowEnd: at, flexible: false } });
    const sorted = [row('no_offers', '2026-11-18T00:00:00.000Z'), row('new_offers', '2026-11-19T00:00:00.000Z'), row('review_work', '2026-11-20T00:00:00.000Z'), row('new_offers', '2026-11-18T00:00:00.000Z')].sort(byAttention);
    expect(sorted.map((item) => `${item.attention.kind} ${item.attention.dueAt.slice(5, 10)}`)).toEqual(['review_work 11-20', 'new_offers 11-18', 'new_offers 11-19', 'no_offers 11-18']);
  });
});
