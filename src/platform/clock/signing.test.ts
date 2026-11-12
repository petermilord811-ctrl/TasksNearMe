import { describe, expect, it } from 'vitest';
import { MAX_CLOCK_OFFSET_MS, readClockOffset, signClockOffset } from './signing';

describe('test clock cookie', () => {
  it('reads back a signed offset, forward or back', () => {
    expect(readClockOffset(signClockOffset(72 * 3_600_000, 'secret'), 'secret')).toBe(72 * 3_600_000);
    expect(readClockOffset(signClockOffset(-90_000, 'secret'), 'secret')).toBe(-90_000);
  });

  it('ignores missing, malformed, forged and out-of-range values', () => {
    const signed = signClockOffset(3_600_000, 'secret');
    expect(readClockOffset(undefined, 'secret')).toBe(0);
    expect(readClockOffset('3600000', 'secret')).toBe(0);
    expect(readClockOffset(signed, 'another secret')).toBe(0);
    expect(readClockOffset(signed.replace('3600000', '7200000'), 'secret')).toBe(0);
    expect(readClockOffset(`${signed}.x`, 'secret')).toBe(0);
    // Signing clamps to 400 days.
    expect(readClockOffset(signClockOffset(MAX_CLOCK_OFFSET_MS * 2, 'secret'), 'secret')).toBe(MAX_CLOCK_OFFSET_MS);
  });
});
