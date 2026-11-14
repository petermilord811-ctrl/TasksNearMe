import { describe, expect, it } from 'vitest';
import { budgetSpread } from './budget-spread';

describe('the usual budget for a kind of task', () => {
  it('is nothing without budgets, and the one budget when there is one', () => {
    expect(budgetSpread([])).toBeUndefined();
    expect(budgetSpread([0, -100])).toBeUndefined();
    expect(budgetSpread([6000])).toEqual({ lowCents: 6000, highCents: 6000 });
  });

  it('spans every budget when there are only a few, in whole dollars', () => {
    expect(budgetSpread([9049, 6000])).toEqual({ lowCents: 6000, highCents: 9000 });
    expect(budgetSpread([4000, 12000, 6050])).toEqual({ lowCents: 4000, highCents: 12000 });
  });

  it('keeps the middle half once there are four or more, so one odd budget doesn’t stretch it', () => {
    expect(budgetSpread([5000, 6000, 7000, 8000, 50000])).toEqual({ lowCents: 6000, highCents: 8000 });
    // Between budgets, as Postgres's percentile_cont: a quarter of the way from $20 to $60, and so on.
    expect(budgetSpread([2000, 6000, 6500, 7000])).toEqual({ lowCents: 5000, highCents: 6600 });
  });
});
