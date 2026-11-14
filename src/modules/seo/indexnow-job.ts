import 'server-only';
import { appUrl } from '@/integrations/oauth';
import { searchIndexing } from '@/shared/search-indexing';
import { changedPagesAnnouncer, submitToIndexNow } from './indexnow';
import { loadSitemapEntries } from './sitemap';

/**
 * The job runner's IndexNow step (src/modules/jobs/runner.ts): every 15 minutes, announce the sitemap pages that are
 * new or changed. Only on the live site (`site` or `on`); a no-op everywhere else.
 */
export const announceChangedPages = changedPagesAnnouncer({
  mode: () => searchIndexing(),
  baseUrl: () => appUrl(),
  load: async (options) => (await loadSitemapEntries(options)).entries,
  submit: (urls, baseUrl) => submitToIndexNow(urls, baseUrl),
});
