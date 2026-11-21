import { CATEGORY_SLUGS, TASK_DESCRIPTION_MAX, TASK_TITLE_MAX, type CategorySlug } from '@/contracts';

type Search = Record<string, string | string[] | undefined>;

/**
 * What a link carries into the post form (a page's "Post a task", the landing page's assistant): the service, a title
 * and the person's own words, tidied and within the form's limits. The app's form and the signed-out one (/post, J-V5)
 * read it the same way.
 */
export function carriedWords(search: Search): { initialCategory?: CategorySlug; title: string; describe: string } {
  const category = typeof search.category === 'string' ? search.category : undefined;
  const initialCategory = category && (CATEGORY_SLUGS as readonly string[]).includes(category) ? (category as CategorySlug) : undefined;
  // Plain text, spaces tidied, line breaks kept, within the description's limit.
  const describe =
    typeof search.describe === 'string'
      ? search.describe.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, TASK_DESCRIPTION_MAX)
      : '';
  const title = typeof search.title === 'string' ? search.title.replace(/\s+/g, ' ').trim().slice(0, TASK_TITLE_MAX) : '';
  return { ...(initialCategory ? { initialCategory } : {}), title, describe };
}

/** A draft's handoff code from a link (J-V5): a UUID, as the signed-out form makes them; anything else is ignored. */
export function handoffCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : undefined;
}
