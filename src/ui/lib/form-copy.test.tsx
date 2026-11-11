/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { ACTION_ERROR_CODES, ACTION_SUCCESS_CODES, FIELD_ERROR_CODES } from '@/contracts';
import forms from '../../../messages/en/ui/forms.json';
import signIn from '../../../messages/en/ui/signIn.json';
import waitlist from '../../../messages/en/ui/waitlist.json';
import help from '../../../messages/en/ui/help.json';
import legal from '../../../messages/en/ui/legal.json';
import feedback from '../../../messages/en/ui/feedback.json';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('form copy', () => {
  it('has friendly copy for every contract field code and action result', () => {
    for (const code of FIELD_ERROR_CODES) expect(forms.fieldErrors).toHaveProperty(code, expect.any(String));
    for (const code of ACTION_ERROR_CODES) expect(feedback.error).toHaveProperty(code, expect.any(String));
    for (const code of ACTION_SUCCESS_CODES) expect(feedback.success).toHaveProperty(code, expect.any(String));
  });

  it.each(Object.entries({ forms, signIn, waitlist, help, legal }))('%s follows the public copy glossary', (_namespace, copy) => {
    const banned = /\b(?:escrow|wallets?|guaranteed|hir(?:e|es|ed|ing)|best|cheapest|jobs?|gigs?|bids?|quotes?|workers?|employees?|taskers?|customers?|employers?|commission|wages)\b/i;
    expect(strings(copy).filter((message) => banned.test(message))).toEqual([]);
  });
});
