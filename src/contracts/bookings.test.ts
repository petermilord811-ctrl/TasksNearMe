import { describe, expect, it } from 'vitest';
import {
  deskAllowanceCompletionPageData,
  deskCompletionPageData,
  movingCompletionPageData,
  remoteCompletionPageData,
} from '@/fixtures';
import { createCompletionInputSchema, reportProblemInputSchema, tipInputSchema, type CompletionInput, type TipInput } from './bookings';

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

  it('takes the category checklist as optional ticks and refuses items it does not have', () => {
    const schema = createCompletionInputSchema(deskCompletionPageData.rules);
    const work = { ...empty, photoIds: ['ph_1'] };
    expect(errorsOf(schema, work)).toEqual({});
    expect(errorsOf(schema, { ...work, checklist: { all_parts_used: true, anchored_if_asked: false } })).toEqual({});
    expect(errorsOf(schema, { ...work, checklist: { all_parts_used: true, load_secured: true } })).toEqual({ checklist: 'invalid' });
  });
});

describe('tip schema', () => {
  const saved = { kind: 'saved', methodId: 'pm_maya_visa' } as const;
  const tipErrors = (input: TipInput) => {
    const result = tipInputSchema.safeParse(input);
    return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
  };

  it('takes $1 to $200 in whole cents, with a card', () => {
    expect(tipErrors({ amountCents: 100, payment: saved })).toEqual({});
    expect(tipErrors({ amountCents: 20_000, payment: saved })).toEqual({});
    expect(tipErrors({ amountCents: 99, payment: saved })).toEqual({ amountCents: 'out_of_range' });
    expect(tipErrors({ amountCents: 20_001, payment: saved })).toEqual({ amountCents: 'out_of_range' });
    expect(tipErrors({ amountCents: 950.5, payment: saved })).toEqual({ amountCents: 'invalid' });
    expect(tipErrors({ amountCents: 900, payment: { kind: 'saved', methodId: '' } })).toEqual({ 'payment.methodId': 'required' });
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
