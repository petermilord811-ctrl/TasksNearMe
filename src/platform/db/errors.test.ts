import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './errors';

describe('isUniqueViolation', () => {
  it('finds the code on the error or its cause', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error('Failed query'), { cause: { code: '23505' } }))).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error('Failed query'), { cause: { code: '23503' } }))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
