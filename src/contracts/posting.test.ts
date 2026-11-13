import { describe, expect, it } from 'vitest';
import { deskDraft, movingDraft, postTaskPageData, remoteHelpDraft } from '@/fixtures';
import { CATEGORY_SLUGS } from './common';
import { CATEGORY_DETAIL_FIELDS, createTaskDraftSchema, findTaskTemplate, isTaskTemplateId, TASK_TEMPLATE_IDS, TASK_TEMPLATES, validateTaskDetails } from './posting';

const schema = createTaskDraftSchema(postTaskPageData);

/** Dotted path → first error code, as a form shows them. */
function errorsOf(input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) errors[issue.path.join('.')] ??= issue.message;
  return errors;
}

describe('task draft schema', () => {
  it('accepts the canonical drafts', () => {
    expect(errorsOf(deskDraft)).toEqual({});
    expect(errorsOf(movingDraft)).toEqual({});
    expect(errorsOf(remoteHelpDraft)).toEqual({});
  });

  it('checks text lengths', () => {
    expect(errorsOf({ ...deskDraft, title: 'Desk', description: 'Too short' })).toMatchObject({
      title: 'too_short',
      description: 'too_short',
    });
  });

  it('checks category details', () => {
    expect(errorsOf({ ...deskDraft, details: { itemCount: 30 } })).toMatchObject({
      'details.itemType': 'required',
      'details.itemCount': 'out_of_range',
    });
  });

  it('treats unanswered optional details (empty, null, NaN) as not provided', () => {
    expect(errorsOf({ ...deskDraft, details: { itemType: 'desk', itemCount: 1, floor: Number.NaN, elevator: null, brand: '', toolsOnSite: undefined } })).toEqual({});
    expect(errorsOf({ ...deskDraft, details: { itemType: 'desk', itemCount: Number.NaN } })).toMatchObject({ 'details.itemCount': 'required' });
  });

  it('allows remote only where the category does', () => {
    expect(errorsOf({ ...deskDraft, location: { mode: 'remote' } })).toMatchObject({ 'location.mode': 'not_supported' });
  });

  it('enforces the 3-hour and 14-day window in market time', () => {
    // Now is Tue Nov 17, 9:00 am CST: 11:00 am the same day is too soon, noon is fine.
    const at = (startTime: string, endTime: string, date = '2026-11-17') => ({ ...deskDraft, schedule: { date, flexible: false, startTime, endTime } });
    expect(errorsOf(at('11:00', '12:00'))).toMatchObject({ 'schedule.startTime': 'out_of_range' });
    expect(errorsOf(at('12:00', '14:00'))).toEqual({});
    expect(errorsOf(at('12:00', '11:00'))).toMatchObject({ 'schedule.endTime': 'out_of_range' });
    expect(errorsOf(at('10:00', '12:00', '2026-12-02'))).toMatchObject({ 'schedule.date': 'out_of_range' });
    expect(errorsOf({ ...deskDraft, schedule: { date: '2026-11-21', flexible: false } })).toMatchObject({
      'schedule.startTime': 'required',
      'schedule.endTime': 'required',
    });
    // A flexible day works as long as some of it is left after the lead time.
    expect(errorsOf({ ...remoteHelpDraft, schedule: { date: '2026-11-17', flexible: true } })).toEqual({});
    expect(errorsOf({ ...remoteHelpDraft, schedule: { date: '2026-11-16', flexible: true } })).toMatchObject({
      'schedule.date': 'out_of_range',
    });
  });

  it('enforces category minimums and sensible hourly caps', () => {
    expect(errorsOf({ ...deskDraft, budget: { type: 'fixed', priceCents: 2000 } })).toMatchObject({
      'budget.priceCents': 'out_of_range',
    });
    expect(
      errorsOf({ ...movingDraft, budget: { type: 'hourly', rateCents: 3500, estimatedHours: 1.5, hoursCap: 1 } }),
    ).toMatchObject({ 'budget.estimatedHours': 'out_of_range', 'budget.hoursCap': 'out_of_range' });
    expect(
      errorsOf({ ...movingDraft, budget: { type: 'hourly', rateCents: 3500, estimatedHours: 2.25, hoursCap: 3 } }),
    ).toMatchObject({ 'budget.estimatedHours': 'invalid' });
  });

  it('caps the expense allowance', () => {
    expect(errorsOf({ ...movingDraft, expenseAllowance: { amountCents: 60000, description: 'Lots of tape' } })).toMatchObject({
      'expenseAllowance.amountCents': 'out_of_range',
    });
  });
});

describe('category detail fields', () => {
  it('defines questions for every category, with unique keys', () => {
    for (const slug of CATEGORY_SLUGS) {
      const keys = CATEGORY_DETAIL_FIELDS[slug].map((field) => field.key);
      expect(keys.length).toBeGreaterThan(1);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('validates value kinds', () => {
    expect(validateTaskDetails('light-cleaning', { bedrooms: 2, bathrooms: 1, pets: 'yes' })).toEqual({ pets: 'invalid' });
    expect(validateTaskDetails('computer-help', { device: 'fax', need: 'fix' })).toEqual({ device: 'invalid' });
  });
});

describe('task templates (blueprint 01, P2 "draft templates per category")', () => {
  it('lists each example once, in the id order, in a real category, with details that pass its questions', () => {
    expect(TASK_TEMPLATES.map((template) => template.id)).toEqual([...TASK_TEMPLATE_IDS]);
    for (const template of TASK_TEMPLATES) {
      expect(CATEGORY_SLUGS).toContain(template.categorySlug);
      expect(validateTaskDetails(template.categorySlug, template.details), template.id).toEqual({});
    }
  });

  it('offers a few examples in every launch category, and none carries a price', () => {
    for (const slug of CATEGORY_SLUGS) expect(TASK_TEMPLATES.filter((template) => template.categorySlug === slug).length, slug).toBeGreaterThanOrEqual(3);
    for (const template of TASK_TEMPLATES) expect(Object.keys(template).sort()).toEqual(['categorySlug', 'details', 'id']);
  });

  it('recognizes its ids and finds a template by id', () => {
    expect(isTaskTemplateId('yard-leaves')).toBe(true);
    expect(isTaskTemplateId('tv-mounting')).toBe(false);
    expect(isTaskTemplateId(undefined)).toBe(false);
    expect(findTaskTemplate('computer-wifi')).toMatchObject({ categorySlug: 'computer-help', details: { device: 'wifi_router', need: 'fix' } });
    expect(findTaskTemplate('nope')).toBeUndefined();
    expect(findTaskTemplate(undefined)).toBeUndefined();
  });
});
