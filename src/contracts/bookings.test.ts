import { describe, expect, it } from 'vitest';
import {
  deskAllowanceCompletionPageData,
  deskCompletionPageData,
  movingCompletionPageData,
  remoteCompletionPageData,
} from '@/fixtures';
import { createCompletionInputSchema, reportProblemInputSchema, type CompletionInput } from './bookings';

const errorsOf = (schema: ReturnType<typeof createCompletionInputSchema>, input: CompletionInput) => {
  const result = schema.safeParse(input);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
};
const empty: CompletionInput = { photoIds: [], note: '', expenses: [] };

describe('completion schema', () => {
  it('asks for a photo of finished in-person work', () => {
    const schema = createCompletionInputSchema(deskCompletionPageData.rules);
    expect(errorsOf(schema, empty)).toEqual({ photoIds: 'required' });
    expect(errorsOf(schema, { ...empty, photoIds: ['ph_1'] })).toEqual({});
  });

  it('asks for hours on hourly bookings, at most the cap, in half hours', () => {
    const schema = createCompletionInputSchema(movingCompletionPageData.rules);
    expect(errorsOf(schema, empty)).toEqual({ hoursWorked: 'required' });
    expect(errorsOf(schema, { ...empty, hoursWorked: 4.5 })).toEqual({ hoursWorked: 'out_of_range' });
    expect(errorsOf(schema, { ...empty, hoursWorked: 3.25 })).toEqual({ hoursWorked: 'invalid' });
    expect(errorsOf(schema, { ...empty, hoursWorked: 3.5 })).toEqual({});
  });

  it('keeps receipts within the allowance, and refuses them without one', () => {
    const receipt = (amountCents: number) => ({ description: 'Wall anchors', amountCents, receiptPhotoId: 'ph_r' });
    const allowance = createCompletionInputSchema(deskAllowanceCompletionPageData.rules);
    expect(errorsOf(allowance, { ...empty, photoIds: ['ph_1'], expenses: [receipt(800)] })).toEqual({});
    expect(errorsOf(allowance, { ...empty, photoIds: ['ph_1'], expenses: [receipt(1500), receipt(800)] })).toEqual({ expenses: 'out_of_range' });
    const none = createCompletionInputSchema(deskCompletionPageData.rules);
    expect(errorsOf(none, { ...empty, photoIds: ['ph_1'], expenses: [receipt(800)] })).toMatchObject({ expenses: 'too_long' });
  });

  it('asks remote helpers for a summary', () => {
    const schema = createCompletionInputSchema(remoteCompletionPageData.rules);
    expect(errorsOf(schema, empty)).toEqual({ note: 'required' });
    expect(errorsOf(schema, { ...empty, note: 'Moved the photos and set up email.' })).toEqual({});
  });
});

describe('problem schema', () => {
  it('needs a reason and a description of at least 20 characters', () => {
    expect(reportProblemInputSchema.safeParse({ reason: 'not_done', description: 'Too short', photoIds: [] }).success).toBe(false);
    expect(
      reportProblemInputSchema.safeParse({ reason: 'not_done', description: 'The drawers were left in the box.', photoIds: [] }).success,
    ).toBe(true);
  });
});
