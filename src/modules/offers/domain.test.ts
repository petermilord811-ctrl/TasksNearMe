import { describe, expect, it } from 'vitest';
import { deskOfferLee } from '@/fixtures';
import { toMessageSegments } from '@/modules/trust/message-segments';
import { posterOfferActions, taskOwnerActions } from './domain';

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
  });
});

describe('task owner actions', () => {
  it('follow the task status', () => {
    expect(taskOwnerActions({ status: 'open' }).map((a) => a.id)).toEqual(['invite_helpers', 'edit_task', 'cancel_task']);
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
