#!/usr/bin/env node
/**
 * Crawl the public site the way a search engine does (no cookies, no JavaScript) and report what it finds:
 *
 *   node scripts/seo/crawl.mjs [origin] [--max 400] [--json out.json]
 *
 * Starts at the home page, /es and every sitemap URL, follows <a href> links on the same host, and records for each
 * page: the status (redirects are not followed, so each hop shows), X-Robots-Tag and meta robots, canonical,
 * title, meta description, H1, visible words and the pages linking to it. The summary flags what Search Console
 * would report: links to pages that redirect, answer 404 or say noindex; indexable pages missing from the sitemap;
 * sitemap pages that aren't indexable; duplicate titles and descriptions; thin pages; canonicals pointing elsewhere.
 * Read-only: GET requests at most 4 at a time.
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const origin = (args.find((arg) => /^https?:\/\//.test(arg)) ?? 'https://tasksnearme.com').replace(/\/$/, '');
const max = Number(flag('--max', 400));
const jsonOut = flag('--json', null);
const host = new URL(origin).host;
/** Words below which an indexable page reads as thin. */
const THIN_WORDS = 250;

const decode = (text) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

function parse(html) {
  const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1];
  const metaRobots = [...html.matchAll(/<meta[^>]+name="(?:robots|googlebot)"[^>]*>/gi)].map((m) => attr(m[0], 'content')).filter(Boolean);
  const canonical = [...html.matchAll(/<link[^>]+rel="canonical"[^>]*>/gi)].map((m) => attr(m[0], 'href'))[0];
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '');
  const description = decode([...html.matchAll(/<meta[^>]+name="description"[^>]*>/gi)].map((m) => attr(m[0], 'content'))[0] ?? '');
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, '').trim()));
  const links = [...html.matchAll(/<a\s[^>]*href="([^"#][^"]*)"[^>]*>/gi)].map((m) => ({ href: decode(m[1]), rel: attr(m[0], 'rel') ?? '' }));
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const words = decode(body).split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  const jsonLdTypes = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].flatMap((m) => {
    try {
      const data = JSON.parse(m[1]);
      const nodes = data['@graph'] ?? (Array.isArray(data) ? data : [data]);
      return nodes.map((node) => node['@type']).flat();
    } catch {
      return ['(invalid JSON-LD)'];
    }
  });
  return { metaRobots, canonical, title, description, h1, links, words, jsonLdTypes };
}

function normalize(href, base) {
  try {
    const url = new URL(href, base);
    if (url.host !== host || !/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

async function sitemapUrls() {
  const response = await fetch(`${origin}/sitemap.xml`);
  if (!response.ok) return [];
  return [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/\/$/, '') || origin);
}

const pages = new Map();
const inbound = new Map();
const queue = [];
const enqueue = (url, from, rel) => {
  if (!inbound.has(url)) inbound.set(url, []);
  if (from) inbound.get(url).push({ from, rel });
  if (!pages.has(url) && !queue.includes(url) && pages.size + queue.length < max) queue.push(url);
};

async function visit(url) {
  const page = { url };
  pages.set(url, page);
  try {
    const response = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'TasksNearMe-SEO-crawl/1.0 (+site audit)' } });
    page.status = response.status;
    page.xRobots = response.headers.get('x-robots-tag');
    page.location = response.headers.get('location');
    if (page.location) {
      const target = normalize(page.location, url);
      if (target) enqueue(target, url, 'redirect');
      return;
    }
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) return;
    const parsed = parse(await response.text());
    Object.assign(page, parsed, { links: undefined, linkCount: parsed.links.length });
    for (const link of parsed.links) {
      const target = normalize(link.href, url);
      if (target) enqueue(target, url, link.rel);
    }
  } catch (error) {
    page.error = String(error.message);
  }
}

const listed = (await sitemapUrls()).map((url) => (url === origin ? `${origin}/` : url));
const inSitemap = new Set(listed);
const seeds = [...new Set([`${origin}/`, `${origin}/es`, ...listed])];
seeds.forEach((url) => enqueue(url === origin ? `${origin}/` : url, null));
while (queue.length > 0) {
  const batch = queue.splice(0, 4);
  await Promise.all(batch.map(visit));
}

const noindex = (page) => /noindex/i.test(page.xRobots ?? '') || (page.metaRobots ?? []).some((value) => /noindex/i.test(value));
const indexable = (page) => page.status === 200 && !noindex(page) && (!page.canonical || page.canonical.replace(/\/$/, '') === page.url.replace(/\/$/, ''));
const path = (url) => url.replace(origin, '') || '/';
const list = [...pages.values()];
const linkedFrom = (url) => [...new Set((inbound.get(url) ?? []).filter((link) => link.rel !== 'redirect').map((link) => path(link.from)))];
const followed = (url) => (inbound.get(url) ?? []).some((link) => link.rel !== 'redirect' && !/nofollow/i.test(link.rel));

const groups = {
  'Linked pages that redirect': list.filter((page) => page.status >= 300 && page.status < 400 && linkedFrom(page.url).length > 0),
  'Linked pages that answer 4xx/5xx': list.filter((page) => (page.status >= 400 || page.error) && linkedFrom(page.url).length > 0),
  'Linked (followed) pages that say noindex': list.filter((page) => page.status === 200 && noindex(page) && followed(page.url)),
  'Indexable pages missing from the sitemap': list.filter((page) => indexable(page) && !inSitemap.has(page.url)),
  'Sitemap pages that are not indexable': list.filter((page) => inSitemap.has(page.url) && !indexable(page)),
  'Canonical pointing elsewhere': list.filter((page) => page.status === 200 && page.canonical && page.canonical.replace(/\/$/, '') !== page.url.replace(/\/$/, '')),
  [`Thin indexable pages (< ${THIN_WORDS} words)`]: list.filter((page) => indexable(page) && page.words < THIN_WORDS),
  'Indexable pages without an H1, or with several': list.filter((page) => indexable(page) && (page.h1?.length ?? 0) !== 1),
};
const duplicates = (key) =>
  Object.entries(
    list.filter(indexable).reduce((acc, page) => {
      if (page[key]) (acc[page[key]] ??= []).push(path(page.url));
      return acc;
    }, {}),
  ).filter(([, urls]) => urls.length > 1);

const lines = [`# Crawl of ${origin}: ${list.length} URLs (${list.filter(indexable).length} indexable, ${inSitemap.size} in the sitemap)`, ''];
for (const [name, entries] of Object.entries(groups)) {
  lines.push(`## ${name}: ${entries.length}`);
  for (const page of entries.slice(0, 40)) {
    const detail = [page.status, page.location && `→ ${path(page.location)}`, page.words !== undefined && `${page.words} words`, page.canonical && page.canonical !== page.url && `canonical ${path(page.canonical)}`, page.h1 && `h1×${page.h1.length}`]
      .filter(Boolean)
      .join(', ');
    lines.push(`- ${path(page.url)} (${detail}) ← ${linkedFrom(page.url).slice(0, 3).join(', ') || 'sitemap'}`);
  }
  lines.push('');
}
for (const key of ['title', 'description']) {
  const dupes = duplicates(key);
  lines.push(`## Duplicate ${key}s among indexable pages: ${dupes.length}`);
  for (const [value, urls] of dupes.slice(0, 20)) lines.push(`- "${value.slice(0, 90)}": ${urls.join(', ')}`);
  lines.push('');
}
lines.push('## Indexable pages', '| Page | Words | Title | JSON-LD |', '|---|---|---|---|');
for (const page of list.filter(indexable).sort((a, b) => a.url.localeCompare(b.url))) {
  lines.push(`| ${path(page.url)} | ${page.words} | ${page.title?.slice(0, 70)} | ${[...new Set(page.jsonLdTypes ?? [])].join(', ')} |`);
}
console.log(lines.join('\n'));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ origin, pages: list, inbound: Object.fromEntries(inbound) }, null, 1));
