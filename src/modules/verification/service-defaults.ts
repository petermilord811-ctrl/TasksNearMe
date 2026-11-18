import { hourlyMinimum, type CategorySlug, type CategoryView, type ServiceDefault } from '@/contracts';

/**
 * The pricing helper setup prefills for a new service (plan 9.11): the category's usual pricing, at the low end of
 * the market's typical range when the range is in the same unit (per hour for hourly work, per item or task for a
 * fixed price), never under what a service may list: the category's minimum for a fixed price, and for hourly work
 * that minimum over the category's minimum hours (aa's sweep S6: the minimum is for a task, so moving help's $35 over
 * 2 hours is $17.50 an hour, and its typical $32 an hour is the prefill). The helper changes it before saving; the
 * services schema checks it.
 */
export function serviceDefaultsFor(categories: Pick<CategoryView, 'slug' | 'defaultPricingType' | 'minPriceCents' | 'minHours' | 'priceGuidance'>[]): Partial<Record<CategorySlug, ServiceDefault>> {
  const defaults: Partial<Record<CategorySlug, ServiceDefault>> = {};
  for (const category of categories) {
    const hourly = category.defaultPricingType === 'hourly';
    const sameUnit = hourly ? category.priceGuidance.unit === 'hour' : category.priceGuidance.unit !== 'hour';
    const least = hourly ? hourlyMinimum(category).rateCents : category.minPriceCents;
    const amount = Math.max(least, sameUnit ? category.priceGuidance.lowCents : 0);
    defaults[category.slug] = hourly
      ? { pricingType: 'hourly', hourlyRateCents: amount, minHours: category.minHours ?? 1 }
      : { pricingType: 'fixed', fromPriceCents: amount };
  }
  return defaults;
}
