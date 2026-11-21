import 'server-only';
import { appUrl } from '@/integrations/oauth';
import { currentSearchIndexing } from './indexing-setting';
import { changedPagesAnnouncer, submitToIndexNow } from './indexnow';
import { loadSitemapEntries } from './sitemap';

/**
 * The job runner's IndexNow step (src/modules/jobs/runner.ts): every 15 minutes, announce the sitemap pages that are
 * new or changed. Only on the live site (`site` or `on`, the admin search setting); a no-op everywhere else. Opening the
 * listings announces them at the next run, since they were never sent.
 */
export const announceChangedPages = changedPagesAnnouncer({
  mode: () => currentSearchIndexing(),
  baseUrl: () => appUrl(),
  load: async (options) => (await loadSitemapEntries(options)).entries,
  submit: (urls, baseUrl) => submitToIndexNow(urls, baseUrl),
});
