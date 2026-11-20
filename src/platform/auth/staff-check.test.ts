import { describe, expect, it } from 'vitest';
import { STAFF_CHECK_TTL_MS, staffCheckCurrent } from './staff-check';

describe('staffCheckCurrent (sweep 2026-11-20)', () => {
  const now = Date.parse('2026-11-20T18:00:00.000Z');
  it('counts a check for a working day, not for the whole 30-day session', () => {
    expect(staffCheckCurrent([{ verifiedAt: new Date(now - 60_000) }], now)).toBe(true);
    expect(staffCheckCurrent([{ verifiedAt: new Date(now - STAFF_CHECK_TTL_MS + 60_000) }], now)).toBe(true);
    expect(staffCheckCurrent([{ verifiedAt: new Date(now - STAFF_CHECK_TTL_MS) }], now)).toBe(false);
    expect(staffCheckCurrent([{ verifiedAt: new Date(now - 3 * 86_400_000) }], now)).toBe(false);
  });
  it('needs a check at all', () => {
    expect(staffCheckCurrent([], now)).toBe(false);
  });
});
