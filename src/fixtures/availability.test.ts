import { describe, expect, it } from 'vitest';
import { AVAILABILITY_STATUSES, availabilityPostInputSchema } from '@/contracts';
import { jordanProfileWithSlotsData, myAvailabilityData, myAvailabilityEmptyData, requestJordanSlotData, slotInviteSentHelper, sundayPostHeld } from './availability';

const time = (iso: string) => new Date(iso).getTime();

describe('availability fixtures', () => {
  it('cover every status, with cancel only while open or requested', () => {
    expect(new Set(myAvailabilityData.posts.map((post) => post.status))).toEqual(new Set(AVAILABILITY_STATUSES));
    for (const post of myAvailabilityData.posts) {
      expect(post.actions).toEqual(post.status === 'active' || post.status === 'held' ? ['cancel_post'] : []);
      expect(time(post.end)).toBeGreaterThan(time(post.start));
    }
    expect(myAvailabilityData.limits.activeCount).toBe(myAvailabilityData.posts.filter((post) => post.status === 'active' || post.status === 'held').length);
    expect(myAvailabilityEmptyData.limits.activeCount).toBe(0);
  });

  it('list upcoming posts soonest first, then past ones newest first', () => {
    const upcoming = myAvailabilityData.posts.filter((post) => ['active', 'held', 'booked'].includes(post.status)).map((post) => time(post.start));
    const past = myAvailabilityData.posts.filter((post) => ['expired', 'canceled'].includes(post.status)).map((post) => time(post.start));
    expect(upcoming).toEqual([...upcoming].sort((a, b) => a - b));
    expect(past).toEqual([...past].sort((a, b) => b - a));
  });

  it('show only open slots on the profile, and slot requests that fit the slot', () => {
    const open = new Set(myAvailabilityData.posts.filter((post) => post.status === 'active').map((post) => post.id));
    for (const slot of jordanProfileWithSlotsData.slots ?? []) expect(open.has(slot.id)).toBe(true);
    const slot = requestJordanSlotData.slot!;
    for (const task of requestJordanSlotData.tasks) {
      expect(task.categorySlug).toBe(slot.categorySlug);
      expect(time(task.windowStart) < time(slot.end) && time(task.windowEnd) > time(slot.start)).toBe(true);
    }
    expect(slotInviteSentHelper.slot).toEqual({ id: sundayPostHeld.id, start: sundayPostHeld.start, end: sundayPostHeld.end });
    expect(sundayPostHeld.request?.inviteId).toBe(slotInviteSentHelper.id);
  });

  it('match the form schema', () => {
    const input = { categorySlug: 'yard-cleanup', date: '2026-12-12', startTime: '09:00', endTime: '13:00', pricing: { type: 'hourly', rateCents: 3000, estimatedHours: 3, hoursCap: 4 } };
    expect(availabilityPostInputSchema.safeParse(input).success).toBe(true);
    expect(availabilityPostInputSchema.safeParse({ ...input, endTime: '08:00' }).error?.issues[0]).toMatchObject({ path: ['endTime'], message: 'out_of_range' });
  });
});
