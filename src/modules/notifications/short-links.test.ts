import { describe, expect, it } from 'vitest';
import { isShortCode, newShortCode, SHORT_CODE_LENGTH } from './short-links';

describe('short links for texts (messages pass J-M9)', () => {
  it('draws 10 base62 characters from a CSPRNG, about 60 bits', () => {
    const codes = Array.from({ length: 2_000 }, newShortCode);
    for (const code of codes) expect(code).toMatch(/^[0-9A-Za-z]{10}$/);
    expect(SHORT_CODE_LENGTH).toBe(10);
    expect(new Set(codes).size).toBe(codes.length);
    // Every character of the alphabet turns up across 20,000 draws: none is left out or overweighted badly.
    const seen = new Map<string, number>();
    for (const char of codes.join('')) seen.set(char, (seen.get(char) ?? 0) + 1);
    expect(seen.size).toBe(62);
    for (const count of seen.values()) expect(count).toBeGreaterThan(200);
  });

  it('knows a code by its shape only', () => {
    expect(isShortCode('Ab3dE6gH9k')).toBe(true);
    for (const value of ['', 'short', 'Ab3dE6gH9k1', 'Ab3dE6gH9-', '../app/x1', 'Ab3dE6gH9k\n']) expect(isShortCode(value), JSON.stringify(value)).toBe(false);
  });
});
