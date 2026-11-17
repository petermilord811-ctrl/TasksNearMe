#!/usr/bin/env node
/**
 * The daily search report (docs/seo/PLAN.md S10): what Google has indexed, which searches show the site and where it
 * ranks, and what changed since the last report. Run once a day (cron on the VPS, 12:30 UTC):
 *
 *   node scripts/seo/report.mjs [--out docs/seo/reports]
 *
 * Writes <out>/<date>.md for people and <out>/<date>.json for the next run's comparison, and copies the Markdown to
 * <out>/latest.md. Uses the service account through scripts/seo/google.mjs (URL Inspection: one call per sitemap page,
 * well within its 2,000-a-day quota). Search data lags about two days.
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

const short = (url) => url.replace(ORIGIN, '') || '/';
const pos = (n) => (n === undefined ? '–' : n.toFixed(1));

async function sitemapUrls() {
  const xml = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

async function inspectAll(urls) {
  const pages = [];
  for (const url of urls) {
    try {
      const status = (await searchConsole.inspect(url)).inspectionResult?.indexStatusResult ?? {};
      pages.push({ url, coverage: status.coverageState ?? 'unknown', lastCrawl: status.lastCrawlTime, googleCanonical: status.googleCanonical });
    } catch (error) {
      pages.push({ url, coverage: `error: ${String(error.message).slice(0, 80)}` });
    }
  }
  return pages;
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

const urls = await sitemapUrls();
const [pages, sitemaps, queries28, queries7, pages28] = await Promise.all([
  inspectAll(urls),
  searchConsole.sitemaps(),
  rows({ days: 28 }),
  rows({ days: 7 }),
  rows({ days: 28, dimensions: ['page'] }),
]);
const snapshot = { date: today, pages, queries28, queries7, pages28 };
const before = previousSnapshot();

const indexed = pages.filter((page) => page.coverage === 'Submitted and indexed');
const byCoverage = Object.entries(pages.reduce((acc, page) => ({ ...acc, [page.coverage]: (acc[page.coverage] ?? 0) + 1 }), {}));
const wasIndexed = new Set((before?.pages ?? []).filter((page) => page.coverage === 'Submitted and indexed').map((page) => page.url));
const newlyIndexed = before ? indexed.filter((page) => !wasIndexed.has(page.url)) : [];
const dropped = before ? pages.filter((page) => wasIndexed.has(page.url) && page.coverage !== 'Submitted and indexed') : [];
const otherCanonical = pages.filter((page) => page.googleCanonical && page.googleCanonical !== page.url);
const previousPosition = new Map((before?.queries28 ?? []).map((row) => [row.keys[0], row.position]));
const sitemap = (sitemaps.sitemap ?? []).find((entry) => entry.path === `${ORIGIN}/sitemap.xml`);
const totals = (list) => list.reduce((acc, row) => ({ clicks: acc.clicks + row.clicks, impressions: acc.impressions + row.impressions }), { clicks: 0, impressions: 0 });
const t7 = totals(queries7);
const t28 = totals(queries28);

const md = `# Search report, ${today}

Google's view of https://tasksnearme.com (Search Console; search data lags about two days).

## Summary
- **Indexed:** ${indexed.length} of ${pages.length} sitemap pages${before ? ` (${indexed.length - wasIndexed.size >= 0 ? '+' : ''}${indexed.length - wasIndexed.size} since ${before.date})` : ''}.
- **Searches showing the site:** ${queries28.length} queries in 28 days; ${t7.impressions} impressions and ${t7.clicks} clicks in the last 7 days (${t28.impressions} and ${t28.clicks} in 28).
- **Sitemap:** last read ${sitemap?.lastDownloaded?.slice(0, 10) ?? 'never'}, ${sitemap?.errors ?? '?'} errors, ${sitemap?.warnings ?? '?'} warnings.
${otherCanonical.length ? `- **Google chose another canonical** for ${otherCanonical.length} pages (see below).\n` : ''}
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
${table(['Page', 'Position', 'Impressions', 'Clicks'], pages28.sort((a, b) => b.impressions - a.impressions).slice(0, 30).map((row) => [short(row.keys[0]), pos(row.position), row.impressions, row.clicks]))}
## Indexing
${table(['Status', 'Pages'], byCoverage.map(([state, count]) => [state, count]))}
${newlyIndexed.length ? `**Newly indexed:** ${newlyIndexed.map((page) => short(page.url)).join(', ')}\n\n` : ''}${dropped.length ? `**No longer indexed:** ${dropped.map((page) => `${short(page.url)} (${page.coverage})`).join(', ')}\n\n` : ''}**Not indexed yet:**
${table(['Page', 'Status', 'Last crawl'], pages.filter((page) => page.coverage !== 'Submitted and indexed').map((page) => [short(page.url), page.coverage, page.lastCrawl?.slice(0, 10) ?? 'never']))}
${otherCanonical.length ? `## Google chose another canonical\n${table(['Page', "Google's canonical"], otherCanonical.map((page) => [short(page.url), short(page.googleCanonical)]))}` : ''}`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${today}.json`), JSON.stringify(snapshot, null, 2));
fs.writeFileSync(path.join(outDir, `${today}.md`), md);
fs.writeFileSync(path.join(outDir, 'latest.md'), md);
console.log(`Search report: ${path.join(outDir, `${today}.md`)} (${indexed.length}/${pages.length} indexed, ${queries28.length} queries)`);
