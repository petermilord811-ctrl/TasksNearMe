import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATEGORY_SLUGS } from '@/contracts';
import { APP_LOCALES } from '@/contracts/locale';

/**
 * Page titles, descriptions and structured data name categories from server.meta.categoryNames; the pages' own
 * headings use helperCard.categories (docs/ui/spanish-glossary.md). Both must say the same, in every language.
 */
interface Catalog {
  meta?: { categoryNames?: Record<string, string> };
  categories?: Record<string, string>;
}
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog;

describe('category names', () => {
  it.each([...APP_LOCALES])('%s: the metadata names match the names the pages show', (locale) => {
    const meta = read(`messages/${locale}/app/server.json`).meta?.categoryNames ?? {};
    const shown = read(`messages/${locale}/ui/helperCard.json`).categories ?? {};
    for (const slug of CATEGORY_SLUGS) {
      expect(meta[slug], `${locale} ${slug}`).toBeTruthy();
      expect(meta[slug], `${locale} ${slug}`).toBe(shown[slug]);
    }
  });
});
