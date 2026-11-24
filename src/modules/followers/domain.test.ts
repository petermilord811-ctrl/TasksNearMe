import { describe, expect, it } from 'vitest';
import { BOOKING_FOLLOWERS_MAX, NOTIFICATION_TYPES, TIMELINE_EVENT_TYPES } from '@/contracts';
import { addBlockedReason, bookingAccessOf, bookingCapabilities, followEndsAt, followerEventParams, followerNotificationFor, followerSeesEvent, followOpen, parseFollowerLookup } from './domain';

const DAY = 86_400_000;
const now = new Date('2026-11-24T12:00:00.000Z');
const booking = (status: string, extra: { completedAt?: Date | null; seriesId?: string | null } = {}) => ({ status, completedAt: extra.completedAt ?? null, seriesId: extra.seriesId ?? null, posterUserId: 'usr_client', helperUserId: 'usr_helper' });

describe('family followers: when following runs', () => {
  it('runs while the booking does, ends at once when canceled, and 7 days after it is done', () => {
    for (const status of ['pending_funding', 'scheduled', 'confirmed', 'in_progress', 'completion_submitted', 'disputed']) expect(followOpen(booking(status), now)).toBe(true);
    expect(followOpen(booking('canceled'), now)).toBe(false);
    expect(followOpen(booking('completed', { completedAt: new Date(now.getTime() - 6 * DAY) }), now)).toBe(true);
    expect(followOpen(booking('completed', { completedAt: new Date(now.getTime() - 7 * DAY) }), now)).toBe(true);
    expect(followOpen(booking('completed', { completedAt: new Date(now.getTime() - 7 * DAY - 1) }), now)).toBe(false);
    expect(followEndsAt(now).getTime()).toBe(now.getTime() + 7 * DAY);
  });

  it('lets the client add up to the limit, never to a booking that is over or to regular visits', () => {
    expect(addBlockedReason(booking('confirmed'), 0, now)).toBeNull();
    expect(addBlockedReason(booking('confirmed'), BOOKING_FOLLOWERS_MAX - 1, now)).toBeNull();
    expect(addBlockedReason(booking('confirmed'), BOOKING_FOLLOWERS_MAX, now)).toBe('limit');
    expect(addBlockedReason(booking('canceled'), 0, now)).toBe('ended');
    expect(addBlockedReason(booking('confirmed', { seriesId: 'ser_1' }), 0, now)).toBe('series');
  });
});

describe('family followers: who the viewer is and what they may do', () => {
  it('never makes a follower the client or the helper', () => {
    expect(bookingAccessOf(booking('confirmed'), 'usr_client', true, now)).toBe('client');
    expect(bookingAccessOf(booking('confirmed'), 'usr_helper', true, now)).toBe('helper');
    expect(bookingAccessOf(booking('confirmed'), 'usr_lia', true, now)).toBe('follower');
    expect(bookingAccessOf(booking('confirmed'), 'usr_lia', false, now)).toBe('none');
    // Following ended with the booking.
    expect(bookingAccessOf(booking('canceled'), 'usr_lia', true, now)).toBe('none');
  });

  it('lets a follower read and nothing else', () => {
    expect(bookingCapabilities('follower')).toEqual({ read: true, sendMessages: false, pay: false, change: false, cancel: false, review: false, seeExactAddress: false, seeMoney: false, manageFollowers: false });
    expect(Object.values(bookingCapabilities('none')).every((can) => !can)).toBe(true);
    expect(bookingCapabilities('client').manageFollowers).toBe(true);
    expect(bookingCapabilities('helper').manageFollowers).toBe(false);
  });

  it('shows a follower the day-of and follower lines, never a line about money, changes or reviews', () => {
    for (const type of ['on_my_way', 'arrived', 'running_late', 'approved', 'canceled', 'follower_added', 'follower_left']) expect(followerSeesEvent(type)).toBe(true);
    for (const type of ['payment_succeeded', 'payment_held', 'payment_failed', 'tip_added', 'refund_issued', 'earnings_transferred', 'payout_paid', 'change_proposed', 'change_applied', 'settlement_offered', 'review_submitted', 'thanks_sent', 'times_shared', 'invite_sent']) expect(followerSeesEvent(type)).toBe(false);
    // Every type a follower sees is a real one.
    for (const type of TIMELINE_EVENT_TYPES) if (followerSeesEvent(type)) expect(type).toBeTruthy();
    expect(followerEventParams({ amountCents: 4500, minutes: 10, changeId: 'chg_1' })).toEqual({ minutes: 10 });
    expect(followerEventParams({ amountCents: 4500 })).toBeUndefined();
    expect(followerEventParams({ name: 'Lia R.' })).toEqual({ name: 'Lia R.' });
  });

  it('tells a follower about the key moments only', () => {
    expect(followerNotificationFor('booking.on_my_way')).toBe('followed_on_the_way');
    expect(followerNotificationFor('booking.arrived')).toBe('followed_arrived');
    expect(followerNotificationFor('booking.completed')).toBe('followed_completed');
    expect(followerNotificationFor('booking.canceled')).toBe('followed_canceled');
    expect(followerNotificationFor('change.applied', { timeChanged: true })).toBe('followed_time_changed');
    expect(followerNotificationFor('change.applied', { timeChanged: false })).toBeNull();
    for (const type of ['booking.confirmed', 'booking.tipped', 'booking.disputed', 'earnings.transferred', 'booking.completion_submitted']) expect(followerNotificationFor(type)).toBeNull();
    for (const type of ['follow_added', 'followed_on_the_way', 'followed_arrived', 'followed_completed', 'followed_canceled', 'followed_time_changed']) expect(NOTIFICATION_TYPES).toContain(type);
  });
});

describe('family followers: "username or email"', () => {
  it('reads an email, or a @username with or without its @, without case', () => {
    expect(parseFollowerLookup(' Lia.Ruiz@Example.com ')).toEqual({ kind: 'email', email: 'lia.ruiz@example.com' });
    expect(parseFollowerLookup('@LiaR')).toEqual({ kind: 'username', username: 'liar' });
    expect(parseFollowerLookup('lia_r')).toEqual({ kind: 'username', username: 'lia_r' });
    expect(parseFollowerLookup('lia@')).toBeNull();
    expect(parseFollowerLookup('a')).toBeNull();
    expect(parseFollowerLookup('two words')).toBeNull();
    expect(parseFollowerLookup('')).toBeNull();
  });
});
