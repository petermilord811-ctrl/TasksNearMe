import { describe, expect, it } from 'vitest';
import { approvalReminderDue, startReminderDue } from './reminders';

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

describe('start reminders', () => {
  const start = new Date('2026-11-21T16:30:00.000Z');
  const ahead = (hours: number) => new Date(start.getTime() - hours * HOUR);
  const booked = ahead(5 * 24);

  it('reminds both people 24 h and 2 h before the start, never after it', () => {
    expect(startReminderDue(start, booked, ahead(25))).toBeNull();
    expect(startReminderDue(start, booked, ahead(24))).toEqual({ threshold: 24, hoursLeft: 24 });
    expect(startReminderDue(start, booked, ahead(3))).toEqual({ threshold: 24, hoursLeft: 3 });
    expect(startReminderDue(start, booked, ahead(2))).toEqual({ threshold: 2, hoursLeft: 2 });
    expect(startReminderDue(start, booked, start)).toBeNull();
  });

  it('skips a reminder longer than the time between booking and start', () => {
    // Booked 3 hours ahead: only the 2 h reminder.
    expect(startReminderDue(start, ahead(3), ahead(2.5))).toBeNull();
    expect(startReminderDue(start, ahead(3), ahead(2))).toEqual({ threshold: 2, hoursLeft: 2 });
  });
});

