import { describe, expect, it } from 'vitest';
import { TASK_TEMPLATES } from '@/contracts';
import { templatesForCategories } from './templates';

describe('templatesForCategories', () => {
  it("keeps only the market's categories, in the catalog's order", () => {
    const picked = templatesForCategories([{ slug: 'yard-cleanup' }, { slug: 'furniture-assembly' }]);
    expect(picked.map((template) => template.categorySlug)).toEqual(
      TASK_TEMPLATES.filter((template) => template.categorySlug === 'furniture-assembly' || template.categorySlug === 'yard-cleanup').map((template) => template.categorySlug),
    );
    expect(picked.every((template) => template.categorySlug === 'yard-cleanup' || template.categorySlug === 'furniture-assembly')).toBe(true);
  });

  it('offers nothing for a market without categories', () => {
    expect(templatesForCategories([])).toEqual([]);
  });
});
