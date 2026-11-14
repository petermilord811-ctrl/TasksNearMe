import { CATEGORY_SLUGS } from '@/contracts/common';

/** First path segments that are sections of their own, not markets (their `/tasks` pages are the app's and staff's). */
const NOT_MARKETS = new Set(['app', 'admin', 'dev']);

/**
 * Where a market's board filtered on one category belongs: that category's job hub (docs/seo/PLAN.md S4), the
 * other filters kept as they are, so every such page has one address. `/austin/tasks?category=moving-help&when=today`
 * becomes `/austin/tasks/moving-help?when=today` (src/proxy.ts answers with a permanent redirect). Null when the
 * address isn't a market's board or names no known category. `path` is without its language prefix.
 */
export function taskHubRedirect(path: string, params: URLSearchParams): string | null {
  const market = /^\/([^/]+)\/tasks\/?$/.exec(path)?.[1];
  const category = params.get('category');
  if (!market || NOT_MARKETS.has(market) || !category || !(CATEGORY_SLUGS as readonly string[]).includes(category)) return null;
  const rest = new URLSearchParams(params);
  rest.delete('category');
  const query = rest.toString();
  return `/${market}/tasks/${category}${query ? `?${query}` : ''}`;
}
