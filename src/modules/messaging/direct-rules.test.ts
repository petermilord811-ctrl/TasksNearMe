import { describe, expect, it } from 'vitest';
import { allowanceResetsAt, directChatRefusal, directPairKey, firstMessagesLeft, type DirectChatFacts } from './direct-rules';

const open: DirectChatFacts = { self: false, viewerActive: true, recipientActive: true, blocked: false, setting: 'everyone', taskContacts: false, startedLastDay: 0, perDay: 10 };

describe('direct conversations (2026-11-21)', () => {
  it('keys a pair the same way whoever starts', () => {
    expect(directPairKey('usr_b', 'usr_a')).toBe('usr_a:usr_b');
    expect(directPairKey('usr_a', 'usr_b')).toBe('usr_a:usr_b');
  });

  it('refuses yourself, gone accounts, blocks, the recipient’s setting and the daily allowance, in that order', () => {
    expect(directChatRefusal(open)).toBeNull();
    expect(directChatRefusal({ ...open, self: true, blocked: true })).toBe('self');
    expect(directChatRefusal({ ...open, viewerActive: false, recipientActive: false })).toBe('account_limited');
    expect(directChatRefusal({ ...open, recipientActive: false, blocked: true })).toBe('unavailable');
    expect(directChatRefusal({ ...open, blocked: true, setting: 'nobody' })).toBe('blocked');
    expect(directChatRefusal({ ...open, setting: 'nobody', startedLastDay: 10 })).toBe('not_accepting');
    expect(directChatRefusal({ ...open, setting: 'task_contacts' })).toBe('task_contacts_only');
    expect(directChatRefusal({ ...open, setting: 'task_contacts', taskContacts: true })).toBeNull();
    expect(directChatRefusal({ ...open, startedLastDay: 9 })).toBeNull();
    expect(directChatRefusal({ ...open, startedLastDay: 10 })).toBe('limit_reached');
  });

  it('lets the starter send 3 messages before an answer, then any number', () => {
    expect(firstMessagesLeft({ viewerStarted: true, viewerSent: 1, otherSent: 0 })).toBe(2);
    expect(firstMessagesLeft({ viewerStarted: true, viewerSent: 3, otherSent: 0 })).toBe(0);
    expect(firstMessagesLeft({ viewerStarted: true, viewerSent: 5, otherSent: 1 })).toBeNull();
    expect(firstMessagesLeft({ viewerStarted: false, viewerSent: 0, otherSent: 2 })).toBeNull();
  });

  it('frees the next start 24 hours after the oldest one of the last day', () => {
    const now = new Date('2026-11-21T12:00:00.000Z');
    expect(allowanceResetsAt([], now)).toBeUndefined();
    expect(allowanceResetsAt([new Date('2026-11-21T09:00:00.000Z'), new Date('2026-11-20T15:00:00.000Z')], now)?.toISOString()).toBe('2026-11-21T15:00:00.000Z');
  });
});
