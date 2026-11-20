import { describe, expect, it } from 'vitest';
import { isUniqueViolation, violatedConstraint } from './errors';

describe('isUniqueViolation', () => {
  it('finds the code on the error or its cause', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error('Failed query'), { cause: { code: '23505' } }))).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error('Failed query'), { cause: { code: '23503' } }))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('violatedConstraint', () => {
  it('names the unique constraint a violation hit, on the error or its cause', () => {
    expect(violatedConstraint(Object.assign(new Error('Failed query'), { cause: { code: '23505', constraint: 'tasks_slug_unique' } }))).toBe('tasks_slug_unique');
    expect(violatedConstraint({ code: '23505' })).toBeNull();
    expect(violatedConstraint({ code: '23503', constraint: 'tasks_slug_unique' })).toBeNull();
    expect(violatedConstraint(undefined)).toBeNull();
  });
});
