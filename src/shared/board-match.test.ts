import { describe, expect, it } from 'vitest';
import type { TaskPublicView } from '@/contracts';
import { deskPublicTask, remoteComputerPublicTask } from '@/fixtures';
import { taskMatchesBoard, taskPriceOf, touchesTime, whenRange, type BoardMatchQuery } from './board-match';

// Tuesday 17 November 2026, 9:00 am in Austin.
const now = new Date('2026-11-17T15:00:00.000Z');
const areaNames = new Map([['mueller', 'Mueller'], ['crestview', 'Crestview']]);
const base: BoardMatchQuery = { areas: [], times: [], few: false, when: 'any', remoteOnly: false };
const task: TaskPublicView = {
  ...deskPublicTask,
  title: 'Assemble a standing desk',
  excerpt: 'Flat-pack desk with a motor, about 40 parts.',
  location: deskPublicTask.location.kind === 'local' ? { ...deskPublicTask.location, areaName: 'Mueller' } : deskPublicTask.location,
  // Wednesday 18 November, 10 am to noon.
  schedule: { windowStart: '2026-11-18T16:00:00.000Z', windowEnd: '2026-11-18T18:00:00.000Z', flexible: false },
  budget: { type: 'fixed', priceCents: 6000 },
  offerCount: 1,
  status: 'open',
  postedAt: '2026-11-17T14:50:00.000Z',
  taskType: 'desk',
};
const AUSTIN = 'America/Chicago';
const GAINESVILLE = 'America/New_York';
const matches = (query: Partial<BoardMatchQuery>, candidate: TaskPublicView = task) => taskMatchesBoard(candidate, { ...base, ...query }, { now, areaNames, timeZone: AUSTIN });

describe('taskMatchesBoard', () => {
  it('passes a new open task through an unfiltered board, and never a closed or past one', () => {
    expect(matches({})).toBe(true);
    expect(matches({}, { ...task, status: 'assigned' })).toBe(false);
    expect(matches({}, { ...task, schedule: { ...task.schedule, windowEnd: '2026-11-17T14:00:00.000Z' } })).toBe(false);
  });

  it('checks the category and its task type', () => {
    expect(matches({ category: 'furniture-assembly' })).toBe(true);
    expect(matches({ category: 'moving-help' })).toBe(false);
    expect(matches({ category: 'furniture-assembly', type: 'desk' })).toBe(true);
    expect(matches({ category: 'furniture-assembly', type: 'bed' })).toBe(false);
  });

  it('finds every keyword in the title or the excerpt, in any case', () => {
    expect(matches({ q: 'DESK motor' })).toBe(true);
    expect(matches({ q: 'desk sofa' })).toBe(false);
  });

  it('keeps a neighborhood by its name, and leaves remote work out of neighborhood filters', () => {
    expect(matches({ areas: ['mueller'] })).toBe(true);
    expect(matches({ areas: ['crestview'] })).toBe(false);
    expect(matches({ areas: ['mueller'] }, { ...remoteComputerPublicTask, status: 'open', schedule: task.schedule })).toBe(false);
    expect(matches({ remoteOnly: true })).toBe(false);
  });

  it('compares prices inclusively, an hourly task by its rate times the estimated hours', () => {
    expect(matches({ minPrice: 60, maxPrice: 60 })).toBe(true);
    expect(matches({ minPrice: 61 })).toBe(false);
    const hourly: TaskPublicView = { ...task, budget: { type: 'hourly', rateCents: 3500, estimatedHours: 2, hoursCap: 3 } };
    expect(taskPriceOf(hourly.budget)).toBe(7000);
    expect(matches({ maxPrice: 69 }, hourly)).toBe(false);
    expect(matches({ pricing: 'hourly' }, hourly)).toBe(true);
    expect(matches({ pricing: 'fixed' }, hourly)).toBe(false);
  });

  it('applies posted within, few offers and the day filters', () => {
    expect(matches({ posted: '24h' })).toBe(true);
    expect(matches({ posted: '24h' }, { ...task, postedAt: '2026-11-15T14:00:00.000Z' })).toBe(false);
    expect(matches({ few: true })).toBe(true);
    expect(matches({ few: true }, { ...task, offerCount: 2 })).toBe(false);
    expect(matches({ when: 'today' })).toBe(false);
    expect(matches({ when: 'this_week' })).toBe(true);
  });

  it('matches times of day in Central time, a flexible day in every slot', () => {
    expect(matches({ times: ['morning'] })).toBe(true);
    expect(matches({ times: ['evening'] })).toBe(false);
    expect(matches({ times: ['evening', 'morning'] })).toBe(true);
    expect(touchesTime({ ...task.schedule, flexible: true }, 'evening', AUSTIN)).toBe(true);
    // 11:30 am to 12:30 pm touches both the morning and the afternoon.
    const noon = { windowStart: '2026-11-18T17:30:00.000Z', windowEnd: '2026-11-18T18:30:00.000Z', flexible: false };
    expect(touchesTime(noon, 'morning', AUSTIN)).toBe(true);
    expect(touchesTime(noon, 'afternoon', AUSTIN)).toBe(true);
    expect(touchesTime(noon, 'evening', AUSTIN)).toBe(false);
  });
});

describe('each board on its own market’s clock (plan 8.1)', () => {
  it('ends “today” at the market’s midnight, and reads mornings on its clock', () => {
    // 9 am in Austin is 10 am in Gainesville; today ends an hour earlier in UTC there.
    expect(whenRange('today', now, GAINESVILLE)).toEqual({ from: now, to: new Date('2026-11-18T05:00:00.000Z') });
    // 11:30 am to 12:30 pm in Austin is 12:30 to 1:30 pm in Gainesville: afternoon only there.
    const noon = { windowStart: '2026-11-18T17:30:00.000Z', windowEnd: '2026-11-18T18:30:00.000Z', flexible: false };
    expect(touchesTime(noon, 'morning', GAINESVILLE)).toBe(false);
    expect(touchesTime(noon, 'morning', AUSTIN)).toBe(true);
    expect(taskMatchesBoard({ ...task, schedule: noon }, { ...base, times: ['morning'] }, { now, areaNames, timeZone: GAINESVILLE })).toBe(false);
  });
});

describe('whenRange', () => {
  it('ends today at midnight and this week on Sunday night, in Austin', () => {
    expect(whenRange('any', now, AUSTIN)).toBeNull();
    expect(whenRange('today', now, AUSTIN)).toEqual({ from: now, to: new Date('2026-11-18T06:00:00.000Z') });
    expect(whenRange('this_week', now, AUSTIN)).toEqual({ from: now, to: new Date('2026-11-23T06:00:00.000Z') });
    expect(whenRange('this_weekend', now, AUSTIN)).toEqual({ from: new Date('2026-11-21T06:00:00.000Z'), to: new Date('2026-11-23T06:00:00.000Z') });
  });
});
