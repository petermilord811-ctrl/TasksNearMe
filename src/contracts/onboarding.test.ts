import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { categoryViews, onboardingBackgroundPending, onboardingDone, samProfileEditorData } from '@/fixtures';
import { createHelperServicesSchema, helperAreaInputSchema, helperProfileInputSchema, helperToolsInputSchema, hourlyMinimum } from './onboarding';

function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) errors[issue.path.join('.')] ??= issue.message;
  return errors;
}

const services = createHelperServicesSchema(categoryViews);

describe('helper onboarding schemas', () => {
  it('profile: headline, bio, and at least one language', () => {
    expect(errorsOf(helperProfileInputSchema, { headline: 'Hi', bio: 'Short', languages: [] })).toEqual({
      headline: 'too_short',
      bio: 'too_short',
      languages: 'required',
    });
    expect(
      errorsOf(helperProfileInputSchema, {
        headline: 'Careful assembly and moving help',
        bio: 'I have assembled furniture for friends and neighbors for years, carefully and tidily.',
        languages: ['en', 'es'],
      }),
    ).toEqual({});
  });

  it('services: category minimums, hourly minimum hours, no duplicates', () => {
    expect(
      errorsOf(services, {
        services: [
          { categorySlug: 'furniture-assembly', pricingType: 'fixed', fromPriceCents: 2000, description: '' },
          { categorySlug: 'moving-help', pricingType: 'hourly', hourlyRateCents: 3500, minHours: 1, description: '' },
          { categorySlug: 'furniture-assembly', pricingType: 'fixed', fromPriceCents: 5000, description: '' },
        ],
      }),
    ).toEqual({
      'services.0.fromPriceCents': 'out_of_range',
      'services.1.minHours': 'out_of_range',
      'services.2.categorySlug': 'invalid',
    });
    expect(errorsOf(services, { services: [] })).toEqual({ services: 'required' });
    expect(
      errorsOf(services, {
        services: [{ categorySlug: 'yard-cleanup', pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2, description: 'Leaves and weeding.' }],
      }),
    ).toEqual({});
  });

  it('services: an hourly rate reaches the category minimum over its minimum hours, as posting and offers check it (aa’s sweep S6)', () => {
    const hourly = (categorySlug: 'moving-help' | 'yard-cleanup', hourlyRateCents: number, minHours: number) =>
      errorsOf(services, { services: [{ categorySlug, pricingType: 'hourly', hourlyRateCents, minHours, description: '' }] });
    // Moving help: $35 for a task, at least 2 hours: $17.50 an hour, or $11.67 over 3 hours.
    expect(hourly('moving-help', 1749, 2)).toEqual({ 'services.0.hourlyRateCents': 'out_of_range' });
    expect(hourly('moving-help', 1750, 2)).toEqual({});
    expect(hourly('moving-help', 1166, 3)).toEqual({ 'services.0.hourlyRateCents': 'out_of_range' });
    expect(hourly('moving-help', 1167, 3)).toEqual({});
    // Yard cleanup by the hour: its $25 over the helper's own minimum hours.
    expect(hourly('yard-cleanup', 1200, 2)).toEqual({ 'services.0.hourlyRateCents': 'out_of_range' });
    expect(hourly('yard-cleanup', 1250, 2)).toEqual({});
    // The least rate and the hours it's worked out for: never fewer than the category's hours, never more than 8.
    const moving = categoryViews.find((category) => category.slug === 'moving-help')!;
    expect(hourlyMinimum(moving)).toEqual({ rateCents: 1750, hours: 2 });
    expect(hourlyMinimum(moving, 3)).toEqual({ rateCents: 1167, hours: 3 });
    expect(hourlyMinimum(moving, 1)).toEqual({ rateCents: 1750, hours: 2 });
    expect(hourlyMinimum(moving, 20)).toEqual({ rateCents: 438, hours: 8 });
  });

  it('area: a known radius', () => {
    expect(errorsOf(helperAreaInputSchema, { areaId: 'area_mueller', serviceRadiusMiles: 5, remoteOk: false })).toEqual({});
    expect(errorsOf(helperAreaInputSchema, { areaId: '', serviceRadiusMiles: 7, remoteOk: false })).toMatchObject({
      areaId: 'required',
      serviceRadiusMiles: 'required',
    });
  });

  it('area somewhere else in the US: a ZIP and a city instead of a neighborhood (national, 2026-11-14)', () => {
    const elsewhere = { where: 'elsewhere' as const, areaId: '', serviceRadiusMiles: 5 as const, remoteOk: false };
    expect(errorsOf(helperAreaInputSchema, { ...elsewhere, homeZip: '75204', homeCity: 'Dallas' })).toEqual({});
    expect(errorsOf(helperAreaInputSchema, elsewhere)).toEqual({ homeZip: 'required', homeCity: 'required' });
    expect(errorsOf(helperAreaInputSchema, { ...elsewhere, homeZip: '7520', homeCity: 'D' })).toEqual({ homeZip: 'invalid', homeCity: 'too_short' });
    // Every field's error at once, even with the radius wrong too.
    expect(errorsOf(helperAreaInputSchema, { ...elsewhere, serviceRadiusMiles: 7, homeZip: '', homeCity: 'Dallas' })).toEqual({ homeZip: 'required', serviceRadiusMiles: 'required' });
  });

  it('tools: short names, at most 20', () => {
    expect(errorsOf(helperToolsInputSchema, { tools: ['Drill', 'x'] })).toEqual({ 'tools.1': 'too_short' });
  });
});

describe('onboarding fixtures', () => {
  it('saved values pass the schemas', () => {
    for (const values of [onboardingBackgroundPending.values, onboardingDone.values, samProfileEditorData.values]) {
      expect(errorsOf(helperProfileInputSchema, values.profile)).toEqual({});
      expect(errorsOf(services, values.services)).toEqual({});
      expect(errorsOf(helperAreaInputSchema, values.area)).toEqual({});
    }
    expect(errorsOf(helperToolsInputSchema, samProfileEditorData.values.tools)).toEqual({});
  });
});
