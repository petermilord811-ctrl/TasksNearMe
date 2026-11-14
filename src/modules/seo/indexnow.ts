import type { MetadataRoute } from 'next';
import type { SearchIndexing } from '@/shared/search-indexing';

/**
 * IndexNow (indexnow.org): tells Bing, Yandex, Seznam, Naver and Yep which pages changed, so they recrawl them within
 * minutes instead of waiting for their crawl. Google doesn't take part (it reads the sitemap). Bing's index also feeds
 * ChatGPT search, Copilot, DuckDuckGo and Yahoo.
 *
 * The key is public by design: search engines check it by fetching https://tasksnearme.com/<key>.txt
 * (public/<key>.txt). Holding it only lets someone announce our own pages, which is harmless.
 */
export const INDEXNOW_KEY = '5bbbab290bb03366f756a312ee5061d8';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
/** The protocol's limit per request. */
const BATCH = 10_000;

export interface IndexNowResult {
  submitted: number;
  /** HTTP status per batch: 200 or 202 accepted, 403 key not valid, 422 URLs not ours, 429 too many requests. */
  statuses: number[];
}

/** Announces pages of `baseUrl`'s host; any other address is dropped (the protocol refuses mixed hosts). */
export async function submitToIndexNow(urls: readonly string[], baseUrl: string, fetcher: typeof fetch = fetch): Promise<IndexNowResult> {
  const origin = new URL(baseUrl);
  const own = [...new Set(urls)].filter((url) => {
    try {
      return new URL(url).host === origin.host;
    } catch {
      return false;
    }
  });
  const statuses: number[] = [];
  for (let start = 0; start < own.length; start += BATCH) {
    const response = await fetcher(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: origin.host,
        key: INDEXNOW_KEY,
        keyLocation: `${origin.origin}/${INDEXNOW_KEY}.txt`,
        urlList: own.slice(start, start + BATCH),
      }),
    });
    statuses.push(response.status);
  }
  return { submitted: own.length, statuses };
}

const accepted = (status: number) => status === 200 || status === 202;

export interface ChangedPagesDeps {
  mode: () => SearchIndexing;
  baseUrl: () => string;
  /** The sitemap's entries for the mode (listings only in `on`). */
  load: (options: { listings: boolean }) => Promise<MetadataRoute.Sitemap>;
  submit: (urls: string[], baseUrl: string) => Promise<IndexNowResult>;
}

/**
 * Announces what changed since the last run: every page the first time (after a deploy, the server starts fresh),
 * then pages whose sitemap date moved, or which are new. At most every `intervalMs`; nothing while indexing is off
 * (development, the e2e build, any copy of the app). Pages are marked sent only once the engines accepted them.
 */
export function changedPagesAnnouncer(deps: ChangedPagesDeps, intervalMs = 15 * 60_000) {
  const sent = new Map<string, string>();
  let lastRun = -Infinity;
  return async function announce(now: Date): Promise<IndexNowResult | null> {
    const mode = deps.mode();
    if (mode === 'off' || now.getTime() - lastRun < intervalMs) return null;
    lastRun = now.getTime();
    const entries = await deps.load({ listings: mode === 'on' });
    const stamp = (entry: MetadataRoute.Sitemap[number]) => String(entry.lastModified ?? '');
    const changed = entries.filter((entry) => sent.get(entry.url) !== stamp(entry));
    if (changed.length === 0) return { submitted: 0, statuses: [] };
    const result = await deps.submit(
      changed.map((entry) => entry.url),
      deps.baseUrl(),
    );
    if (result.statuses.length > 0 && result.statuses.every(accepted)) {
      for (const entry of changed) sent.set(entry.url, stamp(entry));
    }
    return result;
  };
}
