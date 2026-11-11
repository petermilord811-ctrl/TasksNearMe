/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import messages from '../../../../messages/en/ui';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('public discovery copy', () => {
  it.each(['taskBoard', 'publicTask', 'helperProfile', 'reviews'] as const)('%s follows the public glossary', (namespace) => {
    const banned = /\b(?:escrow|wallets?|guaranteed|hir(?:e|es|ed|ing)|best|cheapest|jobs?|gigs?|bids?|quotes?|workers?|employees?|contractors?|taskers?|customers?|employers?|commission|wages|authorization|pre-auth)\b|\b(?:take rate|bonus pay|auto-approval)\b/i;
    expect(strings(messages[namespace]).filter((message) => banned.test(message))).toEqual([]);
  });
});
