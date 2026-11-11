import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { categoryViews, onboardingBackgroundPending, onboardingDone, samProfileEditorData } from '@/fixtures';
import { createHelperServicesSchema, helperAreaInputSchema, helperProfileInputSchema, helperToolsInputSchema } from './onboarding';

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

  it('area: a known radius', () => {
    expect(errorsOf(helperAreaInputSchema, { areaId: 'area_mueller', serviceRadiusMiles: 5, remoteOk: false })).toEqual({});
    expect(errorsOf(helperAreaInputSchema, { areaId: '', serviceRadiusMiles: 7, remoteOk: false })).toMatchObject({
      areaId: 'required',
      serviceRadiusMiles: 'required',
    });
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
