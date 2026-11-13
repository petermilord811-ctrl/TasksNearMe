import { describe, expect, it } from 'vitest';
import { tipPresets, tipRefusal, tipWindowEndsAt, type TipFacts } from './tip-rules';

const approved = new Date('2026-11-21T19:05:00.000Z');
const completed: TipFacts = { status: 'completed', completedVia: 'poster', completedAt: approved, tipped: false };

describe('tip presets', () => {
  it('offers 10, 15 and 20% of the final task price in whole dollars', () => {
    expect(tipPresets(6000)).toEqual([{ percent: 10, amountCents: 600 }, { percent: 15, amountCents: 900 }, { percent: 20, amountCents: 1200 }]);
    // $70: 15% is $10.50, so $11.
    expect(tipPresets(7000).map((preset) => preset.amountCents)).toEqual([700, 1100, 1400]);
    // An hourly final of $153.33: $15.33, $23.00 and $30.67 become $15, $23 and $31.
    expect(tipPresets(15_333).map((preset) => preset.amountCents)).toEqual([1500, 2300, 3100]);
  });

  it('never offers less than $1 or more than $200, and an amount only once', () => {
    expect(tipPresets(500)).toEqual([{ percent: 10, amountCents: 100 }]);
    expect(tipPresets(1500)).toEqual([{ percent: 10, amountCents: 200 }, { percent: 20, amountCents: 300 }]);
    expect(tipPresets(150_000)).toEqual([{ percent: 10, amountCents: 15_000 }, { percent: 15, amountCents: 20_000 }]);
    expect(tipPresets(0)).toEqual([{ percent: 10, amountCents: 100 }]);
  });
});

describe('when the client can tip', () => {
  it('lets the client tip approved work for 14 days, once', () => {
    expect(tipWindowEndsAt(approved).toISOString()).toBe('2026-12-05T19:05:00.000Z');
    expect(tipRefusal(completed, 'poster', new Date('2026-11-21T19:06:00.000Z'))).toBeNull();
    expect(tipRefusal({ ...completed, completedVia: 'auto' }, 'poster', approved)).toBeNull();
    expect(tipRefusal(completed, 'poster', new Date('2026-12-05T19:04:59.000Z'))).toBeNull();
    expect(tipRefusal(completed, 'poster', new Date('2026-12-05T19:05:00.000Z'))).toBe('window_closed');
    expect(tipRefusal({ ...completed, tipped: true }, 'poster', approved)).toBe('already_tipped');
  });

  it("is the client's, and only after the work was approved", () => {
    expect(tipRefusal(completed, 'helper', approved)).toBe('not_client');
    expect(tipRefusal({ ...completed, status: 'completion_submitted', completedVia: null, completedAt: null }, 'poster', approved)).toBe('not_approved');
    expect(tipRefusal({ ...completed, completedVia: 'settlement' }, 'poster', approved)).toBe('not_approved');
    expect(tipRefusal({ ...completed, completedVia: 'support' }, 'poster', approved)).toBe('not_approved');
  });
});
