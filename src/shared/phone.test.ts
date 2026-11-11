import { describe, expect, it } from 'vitest';
import { formatUsPhone, maskUsPhone, normalizeUsPhone } from './phone';

describe('normalizeUsPhone', () => {
  it.each([
    ['(512) 555-0167', '+15125550167'],
    ['512.555.0167', '+15125550167'],
    ['512 555 0167', '+15125550167'],
    ['+1 512 555 0167', '+15125550167'],
    ['15125550167', '+15125550167'],
    ['  5125550167 ', '+15125550167'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeUsPhone(input)).toBe(expected);
  });

  it.each([
    '',
    '555-0167',
    '+44 20 7946 0958',
    '012 555 0167',
    '512 155 0167',
    '512-555-01678',
    '512-555-abcd',
    '25125550167',
  ])('rejects %j', (input) => {
    expect(normalizeUsPhone(input)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats and masks E.164 numbers', () => {
    expect(formatUsPhone('+15125550167')).toBe('(512) 555-0167');
    expect(maskUsPhone('+15125550167')).toBe('(512) •••-••67');
  });

  it('never reveals a malformed number', () => {
    expect(maskUsPhone('5125550167')).toBe('•••');
  });
});
