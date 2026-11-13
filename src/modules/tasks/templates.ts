import { TASK_TEMPLATES, type CategoryView, type TaskTemplate } from '@/contracts';

/**
 * "Start from an example" (blueprint 01, P2 "draft templates per category"): the examples for the categories a
 * market offers, in the catalog's order. Their words are copy (`postTask.templates.<id>`); a template only
 * carries its category and details, never a price.
 */
export function templatesForCategories(categories: readonly Pick<CategoryView, 'slug'>[]): TaskTemplate[] {
  const offered = new Set(categories.map((category) => category.slug));
  return TASK_TEMPLATES.filter((template) => offered.has(template.categorySlug));
}
