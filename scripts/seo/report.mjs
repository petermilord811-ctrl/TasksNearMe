#!/usr/bin/env node
/**
 * The daily search report (docs/seo/PLAN.md S10): what Google has indexed, which searches show the site and where it
 * ranks, and what changed since the last report. Run once a day (cron on the VPS, 12:30 UTC):
 *
 *   node scripts/seo/report.mjs [--out docs/seo/reports]
 *
 * Writes <out>/<date>.md for people and <out>/<date>.json for the next run's comparison, and copies the Markdown to
 * <out>/latest.md. Uses the service account through scripts/seo/google.mjs (URL Inspection: one call per sitemap page
 * and per watched address, well within its 2,000-a-day quota). Search data lags about two days.
 *
 * Besides the sitemap's pages it follows:
 * - searches for the brand ("tasksnearme", "tasks near me"), over 90 days, since they are rare and the owner's first
 *   measure of the brand;
 * - addresses Google learned before they left search, so the report shows them leaving: Austin's pages (a later
 *   city since 2026-11-17, its pages answer 404 until it opens), a few of the demo cities' pages (noindex), and an
 *   /en/ address (a permanent redirect to the plain one);
 * - pages that had impressions but no longer answer 200 (a stale result someone can still click);
 * and it resubmits the sitemap when it changed after Google last read it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ORIGIN, searchConsole } from './google.mjs';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const outDir = path.resolve(outAt >= 0 ? args[outAt + 1] : 'docs/seo/reports');
const today = new Date().toISOString().slice(0, 10);

/** Searches the owner cares about most: the brand-equals-category term, the launch city, and each service. */
const WATCH = ['tasks near me', 'tasksnearme', 'gainesville', 'austin', 'furniture assembly', 'moving help', 'yard', 'cleaning', 'computer help'];
/** The brand, typed as one word or as the phrase. */
const BRAND = /tasks\s*near\s*me|tasksnear/i;
const CATEGORIES = ['furniture-assembly', 'moving-help', 'yard-cleanup', 'light-cleaning', 'computer-help'];
/** Addresses Google knew before they left search, by group (see the comment at the top). */
const WATCHED_GROUPS = {
  'Austin (later city, 404 until it opens)': ['', '/es'].flatMap((prefix) => [
    `${prefix}/austin`,
    `${prefix}/austin/tasks`,
    ...CATEGORIES.flatMap((category) => [`${prefix}/austin/${category}`, `${prefix}/austin/${category}/cost`, `${prefix}/austin/tasks/${category}`]),
  ]),
  'Demo cities (noindex, signed-in testers only)': ['/dallas', '/es/houston/tasks', '/nashville/yard-cleanup', '/chicago/moving-help/cost'],
  '/en/ addresses (permanent redirect)': ['/en/become-a-helper', '/en/pricing'],
};

const short = (url) => url.replace(ORIGIN, '') || '/';
const pos = (n) => (n === undefined ? '–' : n.toFixed(1));

async function sitemap() {
  const xml = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
  return {
    urls: [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]),
    newest: [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]).sort().at(-1),
  };
}

/** One inspection, tried again once after a pause: the API answers an occasional 5xx. */
async function inspect(url) {
  try {
    return await searchConsole.inspect(url);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return searchConsole.inspect(url);
  }
}

async function inspectAll(urls) {
  const pages = [];
  for (const url of urls) {
    try {
      const status = (await inspect(url)).inspectionResult?.indexStatusResult ?? {};
      pages.push({ url, coverage: status.coverageState ?? 'unknown', lastCrawl: status.lastCrawlTime, googleCanonical: status.googleCanonical });
    } catch (error) {
      pages.push({ url, coverage: `error: ${String(error.message).slice(0, 80)}` });
    }
  }
  return pages;
}

/** The status each address answers now, without following redirects. */
async function liveStatus(urls) {
  const statuses = new Map();
  for (const url of urls) {
    try {
      statuses.set(url, (await fetch(url, { redirect: 'manual' })).status);
    } catch {
      statuses.set(url, 'error');
    }
  }
  return statuses;
}

const rows = async (options) => (await searchConsole.analytics({ rowLimit: 500, ...options })).rows ?? [];

function previousSnapshot() {
  if (!fs.existsSync(outDir)) return null;
  const files = fs.readdirSync(outDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name) && name < `${today}.json`).sort();
  return files.length ? JSON.parse(fs.readFileSync(path.join(outDir, files.at(-1)), 'utf8')) : null;
}

function table(header, lines) {
  if (lines.length === 0) return '_None yet._\n';
  return `| ${header.join(' | ')} |\n|${header.map(() => '---').join('|')}|\n${lines.map((line) => `| ${line.join(' | ')} |`).join('\n')}\n`;
}

const countBy = (list, key) => Object.entries(list.reduce((acc, item) => ({ ...acc, [item[key]]: (acc[item[key]] ?? 0) + 1 }), {}));

const map = await sitemap();
const urls = map.urls;
const watchedUrls = Object.values(WATCHED_GROUPS).flat().map((suffix) => `${ORIGIN}${suffix}`);
const [pages, watched, sitemaps, queries28, queries7, pages28, brandOneWord, brandPhrase] = await Promise.all([
  inspectAll(urls),
  inspectAll(watchedUrls),
  searchConsole.sitemaps(),
  rows({ days: 28 }),
  rows({ days: 7 }),
  rows({ days: 28, dimensions: ['page'] }),
  rows({ days: 90, filter: 'tasksnear' }),
  rows({ days: 90, filter: 'near me' }),
]);
const brand = [...brandOneWord, ...brandPhrase.filter((row) => BRAND.test(row.keys[0]) && !brandOneWord.some((other) => other.keys[0] === row.keys[0]))];
const live = await liveStatus(pages28.map((row) => row.keys[0]));
const snapshot = { date: today, pages, watched, queries28, queries7, pages28, brand };
const before = previousSnapshot();

// Resubmitting is a hint, as the sitemap is; it's worth one call when the sitemap changed after Google last read it.
const sitemapEntry = (sitemaps.sitemap ?? []).find((entry) => entry.path === `${ORIGIN}/sitemap.xml`);
let resubmitted = false;
if (map.newest && (!sitemapEntry?.lastDownloaded || Date.parse(map.newest) > Date.parse(sitemapEntry.lastDownloaded))) {
  try {
    await searchConsole.submitSitemap();
    resubmitted = true;
  } catch (error) {
    console.error(`Resubmitting the sitemap failed: ${error.message}`);
  }
}

const indexed = pages.filter((page) => page.coverage === 'Submitted and indexed');
const byCoverage = countBy(pages, 'coverage');
const wasIndexed = new Set((before?.pages ?? []).filter((page) => page.coverage === 'Submitted and indexed').map((page) => page.url));
const newlyIndexed = before ? indexed.filter((page) => !wasIndexed.has(page.url)) : [];
const dropped = before ? pages.filter((page) => wasIndexed.has(page.url) && page.coverage !== 'Submitted and indexed') : [];
const otherCanonical = pages.filter((page) => page.googleCanonical && page.googleCanonical !== page.url);
const previousPosition = new Map((before?.queries28 ?? []).map((row) => [row.keys[0], row.position]));
const totals = (list) => list.reduce((acc, row) => ({ clicks: acc.clicks + row.clicks, impressions: acc.impressions + row.impressions }), { clicks: 0, impressions: 0 });
const t7 = totals(queries7);
const t28 = totals(queries28);
const stale = pages28.filter((row) => live.get(row.keys[0]) !== 200);
const groupRows = Object.entries(WATCHED_GROUPS).flatMap(([group, suffixes]) => {
  const inGroup = watched.filter((page) => suffixes.some((suffix) => page.url === `${ORIGIN}${suffix}`));
  return countBy(inGroup, 'coverage').map(([state, count]) => [group, state, count]);
});

const md = `# Search report, ${today}

Google's view of https://tasksnearme.com (Search Console; search data lags about two days).

## Summary
- **Indexed:** ${indexed.length} of ${pages.length} sitemap pages${before ? ` (${indexed.length - wasIndexed.size >= 0 ? '+' : ''}${indexed.length - wasIndexed.size} since ${before.date})` : ''}.
- **Searches showing the site:** ${queries28.length} queries in 28 days; ${t7.impressions} impressions and ${t7.clicks} clicks in the last 7 days (${t28.impressions} and ${t28.clicks} in 28).
- **Brand searches** ("tasksnearme", "tasks near me"): ${brand.length ? `${brand.length} in 90 days, best position ${pos(Math.min(...brand.map((row) => row.position)))}` : 'none with impressions in 90 days yet'}.
- **Sitemap:** last read ${sitemapEntry?.lastDownloaded?.slice(0, 10) ?? 'never'}, ${sitemapEntry?.errors ?? '?'} errors, ${sitemapEntry?.warnings ?? '?'} warnings${resubmitted ? '; resubmitted today (it changed since Google read it)' : ''}.
${otherCanonical.length ? `- **Google chose another canonical** for ${otherCanonical.length} pages (see below).\n` : ''}${stale.length ? `- **${stale.length} pages with impressions no longer answer 200** (see below).\n` : ''}
## Brand searches (90 days)
${table(['Search', 'Position', 'Impressions', 'Clicks'], brand.sort((a, b) => b.impressions - a.impressions).map((row) => [row.keys[0], pos(row.position), row.impressions, row.clicks]))}
## Searches we watch (28 days)
${table(['Search', 'Position', 'Change', 'Impressions', 'Clicks'], queries28
  .filter((row) => WATCH.some((word) => row.keys[0].includes(word)))
  .sort((a, b) => a.position - b.position)
  .map((row) => {
    const was = previousPosition.get(row.keys[0]);
    const change = was === undefined ? 'new' : (was - row.position).toFixed(1).replace(/^(?!-)/, '+');
    return [row.keys[0], pos(row.position), change, row.impressions, row.clicks];
  }))}
## All searches (28 days, by impressions)
${table(['Search', 'Position', 'Impressions', 'Clicks'], queries28.sort((a, b) => b.impressions - a.impressions).slice(0, 30).map((row) => [row.keys[0], pos(row.position), row.impressions, row.clicks]))}
## Pages people saw (28 days)
${table(['Page', 'Position', 'Impressions', 'Clicks', 'Answers now'], pages28.sort((a, b) => b.impressions - a.impressions).slice(0, 30).map((row) => [short(row.keys[0]), pos(row.position), row.impressions, row.clicks, live.get(row.keys[0])]))}
## Indexing
${table(['Status', 'Pages'], byCoverage.map(([state, count]) => [state, count]))}
${newlyIndexed.length ? `**Newly indexed:** ${newlyIndexed.map((page) => short(page.url)).join(', ')}\n\n` : ''}${dropped.length ? `**No longer indexed:** ${dropped.map((page) => `${short(page.url)} (${page.coverage})`).join(', ')}\n\n` : ''}**Not indexed yet:**
${table(['Page', 'Status', 'Last crawl'], pages.filter((page) => page.coverage !== 'Submitted and indexed').map((page) => [short(page.url), page.coverage, page.lastCrawl?.slice(0, 10) ?? 'never']))}
## Addresses leaving search
Pages Google learned before they left search. They drop out as Google recrawls them; nothing needs doing.
${table(['Group', "Google's status", 'Addresses'], groupRows)}
${otherCanonical.length ? `## Google chose another canonical\n${table(['Page', "Google's canonical"], otherCanonical.map((page) => [short(page.url), short(page.googleCanonical)]))}` : ''}`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${today}.json`), JSON.stringify(snapshot, null, 2));
fs.writeFileSync(path.join(outDir, `${today}.md`), md);
fs.writeFileSync(path.join(outDir, 'latest.md'), md);
console.log(`Search report: ${path.join(outDir, `${today}.md`)} (${indexed.length}/${pages.length} indexed, ${queries28.length} queries)`);
