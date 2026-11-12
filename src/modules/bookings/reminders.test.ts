import { describe, expect, it } from 'vitest';
import { approvalReminderDue } from './reminders';

const HOUR = 3_600_000;
const due = new Date('2026-11-24T17:48:00.000Z');
const before = (hours: number) => new Date(due.getTime() - hours * HOUR);
/** Submitted with the standard 72 h to approve. */
const submitted = before(72);

describe('approval reminders', () => {
  it('reminds 24 h and 4 h before the work is approved automatically', () => {
    expect(approvalReminderDue(due, submitted, before(30))).toBeNull();
    expect(approvalReminderDue(due, submitted, before(24))).toEqual({ threshold: 24, hoursLeft: 24 });
    expect(approvalReminderDue(due, submitted, before(10))).toEqual({ threshold: 24, hoursLeft: 10 });
    expect(approvalReminderDue(due, submitted, before(4))).toEqual({ threshold: 4, hoursLeft: 4 });
    expect(approvalReminderDue(due, submitted, new Date(due.getTime() - 20 * 60_000))).toEqual({ threshold: 4, hoursLeft: 1 });
    expect(approvalReminderDue(due, submitted, due)).toBeNull();
  });

  it('skips a threshold longer than the approval window', () => {
    // A market with 12 h to approve gets the 4 h reminder only.
    const shortWindow = before(12);
    expect(approvalReminderDue(due, shortWindow, before(11))).toBeNull();
    expect(approvalReminderDue(due, shortWindow, before(4))).toEqual({ threshold: 4, hoursLeft: 4 });
  });
});
