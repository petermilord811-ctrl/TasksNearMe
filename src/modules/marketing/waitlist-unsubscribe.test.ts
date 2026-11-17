import { describe, expect, it } from 'vitest';
import { readUnsubscribeToken, unsubscribeToken } from '@/modules/notifications/unsubscribe';
import { readWaitlistUnsubscribeToken, WAITLIST_LINK_DAYS, waitlistOneClickUrl, waitlistUnsubscribePageUrl, waitlistUnsubscribeToken } from './waitlist-unsubscribe';

const KEY = 'test-secret';
const ENTRY = 'wl_0123456789abcdef0123456789abcdef';
const SENT = new Date('2026-11-17T15:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('the waitlist email’s unsubscribe link (plan 8.3)', () => {
  it('names the entry, signed, and reads back', () => {
    const token = waitlistUnsubscribeToken(ENTRY, KEY, SENT);
    expect(token.startsWith(`w.${ENTRY}.`)).toBe(true);
    expect(readWaitlistUnsubscribeToken(token, KEY, SENT)).toBe(ENTRY);
  });

  it('refuses a changed entry, another key, a cut-off link and anything else', () => {
    const token = waitlistUnsubscribeToken(ENTRY, KEY, SENT);
    expect(readWaitlistUnsubscribeToken(token.replace(ENTRY, 'wl_0123456789abcdef0123456789abcdee'), KEY, SENT)).toBeNull();
    expect(readWaitlistUnsubscribeToken(token, 'other-secret', SENT)).toBeNull();
    expect(readWaitlistUnsubscribeToken(token.slice(0, -4), KEY, SENT)).toBeNull();
    expect(readWaitlistUnsubscribeToken(undefined, KEY, SENT)).toBeNull();
    expect(readWaitlistUnsubscribeToken('x'.repeat(300), KEY, SENT)).toBeNull();
  });

  it('works for a year from the day it was sent', () => {
    const token = waitlistUnsubscribeToken(ENTRY, KEY, SENT);
    expect(readWaitlistUnsubscribeToken(token, KEY, new Date(SENT.getTime() + WAITLIST_LINK_DAYS * DAY))).toBe(ENTRY);
    expect(readWaitlistUnsubscribeToken(token, KEY, new Date(SENT.getTime() + (WAITLIST_LINK_DAYS + 1) * DAY))).toBeNull();
  });

  it('never passes for an account’s unsubscribe link, nor the other way round', () => {
    expect(readUnsubscribeToken(waitlistUnsubscribeToken(ENTRY, KEY, SENT), KEY, SENT)).toBeNull();
    expect(readWaitlistUnsubscribeToken(unsubscribeToken('usr_maya', 'tips_and_news', KEY, SENT), KEY, SENT)).toBeNull();
  });

  it('opens the page in the entry’s language; one-click posts to the API', () => {
    expect(waitlistUnsubscribePageUrl('https://tasksnearme.test', ENTRY, 'en', SENT)).toMatch(/^https:\/\/tasksnearme\.test\/email\/waitlist\?token=w\./);
    expect(waitlistUnsubscribePageUrl('https://tasksnearme.test', ENTRY, 'es', SENT)).toMatch(/^https:\/\/tasksnearme\.test\/es\/email\/waitlist\?token=w\./);
    expect(waitlistOneClickUrl('https://tasksnearme.test', ENTRY, SENT)).toMatch(/^https:\/\/tasksnearme\.test\/api\/email\/waitlist\?token=w\./);
  });
});
