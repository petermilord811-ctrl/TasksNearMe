import { describe, expect, it } from 'vitest';
import { phoneCheckOf, phoneGatePasses } from './phone-check';

describe('the phone check (plan 9.2)', () => {
  it('is off without texts, asked in the grace, and required otherwise', () => {
    expect(phoneCheckOf(false, false)).toBe('off');
    expect(phoneCheckOf(false, true)).toBe('off');
    expect(phoneCheckOf(true, true)).toBe('asked');
    expect(phoneCheckOf(true, false)).toBe('required');
  });

  it('lets things go ahead unless a phone is required and not verified', () => {
    expect(phoneGatePasses('off', false)).toBe(true);
    expect(phoneGatePasses('asked', false)).toBe(true);
    expect(phoneGatePasses('required', false)).toBe(false);
    expect(phoneGatePasses('required', true)).toBe(true);
  });
});
