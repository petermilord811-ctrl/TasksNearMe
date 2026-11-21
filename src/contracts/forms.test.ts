import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { emailInputSchema, oneTimeCodeInputSchema, phoneInputSchema, profileInputSchema } from './auth';
import { FIELD_ERROR_CODES } from './actions';
import { waitlistInputSchema } from './marketing';

/** Field → first error code, the way a form shows them. */
function firstErrors(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0]);
    errors[field] ??= issue.message;
  }
  return errors;
}

describe('form schemas speak in field error codes', () => {
  it('email: required, invalid, normalized', () => {
    expect(firstErrors(emailInputSchema, { email: '  ' })).toEqual({ email: 'required' });
    expect(firstErrors(emailInputSchema, { email: 'maya@' })).toEqual({ email: 'invalid' });
    expect(emailInputSchema.parse({ email: ' Maya@Example.TEST ' })).toEqual({ email: 'maya@example.test' });
  });

  it('one-time code: six digits', () => {
    expect(firstErrors(oneTimeCodeInputSchema, { code: '' })).toEqual({ code: 'required' });
    expect(firstErrors(oneTimeCodeInputSchema, { code: '12345' })).toEqual({ code: 'invalid' });
    expect(oneTimeCodeInputSchema.parse({ code: ' 123456 ' })).toEqual({ code: '123456' });
  });

  it('phone: US only', () => {
    expect(firstErrors(phoneInputSchema, { phone: '' })).toEqual({ phone: 'required' });
    expect(firstErrors(phoneInputSchema, { phone: '555-0167' })).toEqual({ phone: 'invalid' });
    expect(firstErrors(phoneInputSchema, { phone: '+44 20 7946 0958' })).toEqual({ phone: 'not_supported' });
    expect(phoneInputSchema.safeParse({ phone: '(512) 555-0167' }).success).toBe(true);
  });

  it('profile: names, 18+, and terms', () => {
    expect(
      firstErrors(profileInputSchema, { firstName: ' ', lastName: 'x'.repeat(61), adultAttested: false, termsAccepted: true }),
    ).toEqual({ firstName: 'required', lastName: 'too_long', adultAttested: 'must_accept' });
    expect(
      profileInputSchema.parse({ firstName: ' Maya ', lastName: 'Rivera', adultAttested: true, termsAccepted: true }),
    ).toMatchObject({ firstName: 'Maya' });
  });

  it('names carry no contact details and never pass for our team (abuse rehearsal J-AB3)', () => {
    const name = (firstName: string, lastName = 'Rivera') => firstErrors(profileInputSchema, { firstName, lastName, adultAttested: true, termsAccepted: true });
    // A number, an email or a link would show beside offers and messages, before contact details are shared.
    for (const firstName of ['Text 3525550101', 'Maya３', 'maya@example.test', 'www.mayacleans', 'mayacleans.com', 'https://x']) expect(name(firstName)).toEqual({ firstName: 'contact_details' });
    for (const firstName of ['TasksNearMe', 'Tasks Near Me', 'Support', 'Soporte', 'Admin', 'Staff', 'Equipo', 'Official', 'Deleted']) expect(name(firstName)).toEqual({ firstName: 'name_reserved' });
    expect(name('Maya', 'Support Team')).toEqual({ lastName: 'name_reserved' });
    // Real names stay fine: accents, hyphens, apostrophes, initials, other scripts, and words that merely contain one.
    for (const [firstName, lastName] of [['María José', 'García-López'], ["D'Andre", "O'Neil"], ['J.R.', 'Smith'], ['Zoë', 'Teams'], ['李', '小龙'], ['Stafford', 'Supportman'], ['Adminah', 'Equipol']]) {
      expect(name(firstName!, lastName)).toEqual({});
    }
  });

  it('waitlist: email, ZIP, and interest', () => {
    expect(firstErrors(waitlistInputSchema, { email: 'a@b.co', zip: '1000', interest: undefined })).toEqual({
      zip: 'invalid',
      interest: 'required',
    });
  });

  it('only uses known codes', () => {
    const results = [
      firstErrors(emailInputSchema, { email: '' }),
      firstErrors(phoneInputSchema, { phone: '+44 1' }),
      firstErrors(profileInputSchema, {}),
      firstErrors(waitlistInputSchema, {}),
    ];
    for (const errors of results) {
      for (const code of Object.values(errors)) {
        expect(FIELD_ERROR_CODES as readonly string[]).toContain(code);
      }
    }
  });
});
