import { describe, expect, it } from 'vitest';
import { responseTimeRange } from './response-time';

describe('responseTimeRange', () => {
  it('rounds minutes into ranges, and says nothing past a day', () => {
    expect(responseTimeRange(5)).toBe('hour');
    expect(responseTimeRange(60)).toBe('hour');
    expect(responseTimeRange(61)).toBe('few_hours');
    expect(responseTimeRange(240)).toBe('few_hours');
    expect(responseTimeRange(600)).toBe('day');
    expect(responseTimeRange(1441)).toBeUndefined();
    expect(responseTimeRange(undefined)).toBeUndefined();
    expect(responseTimeRange(null)).toBeUndefined();
  });
});
