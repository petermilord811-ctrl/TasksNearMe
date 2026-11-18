import type { CategorySlug, CategoryView, ServiceDefault } from '@/contracts';

/**
 * The pricing helper setup prefills for a new service (plan 9.11): the category's usual pricing, at the low end of
 * the market's typical range when the range is in the same unit (per hour for hourly work, per item or task for a
 * fixed price), never under the category's minimum. The helper changes it before saving; the services schema
 * still checks the minimums.
 */
export function serviceDefaultsFor(categories: Pick<CategoryView, 'slug' | 'defaultPricingType' | 'minPriceCents' | 'minHours' | 'priceGuidance'>[]): Partial<Record<CategorySlug, ServiceDefault>> {
  const defaults: Partial<Record<CategorySlug, ServiceDefault>> = {};
  for (const category of categories) {
    const hourly = category.defaultPricingType === 'hourly';
    const sameUnit = hourly ? category.priceGuidance.unit === 'hour' : category.priceGuidance.unit !== 'hour';
    const amount = Math.max(category.minPriceCents, sameUnit ? category.priceGuidance.lowCents : 0);
    defaults[category.slug] = hourly
      ? { pricingType: 'hourly', hourlyRateCents: amount, minHours: category.minHours ?? 1 }
      : { pricingType: 'fixed', fromPriceCents: amount };
  }
  return defaults;
}
