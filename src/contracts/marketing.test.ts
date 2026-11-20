import { describe, expect, it } from 'vitest';
import { waitlistInputSchema } from './marketing';

const entry = (city: string) => ({ email: 'pat@example.test', zip: '78701', interest: 'need_help', city });
const cityErrors = (city: string) => {
  const result = waitlistInputSchema.safeParse(entry(city));
  return result.success ? [] : result.error.issues.filter((issue) => issue.path[0] === 'city').map((issue) => issue.message);
};

describe('the waitlist city (shown on public pages)', () => {
  it('takes place names with their punctuation', () => {
    for (const city of ['Saint Paul', 'Winston-Salem', "Coeur d'Alene", 'São Paulo', 'Washington, D.C.', 'St. Louis', '']) expect(cityErrors(city), city).toEqual([]);
  });

  it('refuses numbers, addresses and links (security review 2026-11-20)', () => {
    for (const city of ['Call 512-555-0101', 'maya@example.com', 'example.org/jobs', 'https://x']) expect(cityErrors(city), city).toEqual(['invalid']);
  });
});
