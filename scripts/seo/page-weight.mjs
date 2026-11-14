#!/usr/bin/env node
/**
 * What a public page makes a phone download (docs/seo/PLAN.md S9): its HTML, scripts and stylesheets, raw and gzipped,
 * and the largest scripts, so the JavaScript budget can be checked after each build without Lighthouse or an API key.
 *
 *   node scripts/seo/page-weight.mjs [--base https://tasksnearme.com] [--json] [path...]
 *
 * Paths default to the pages search engines index first. Only same-origin `<script src>` and stylesheet links count
 * (what Next.js serves from /_next); inline scripts are part of the HTML.
 */
import { gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  if (at === -1) return undefined;
  const [value] = args.splice(at, 2).slice(1);
  return value;
};
const base = (flag('--base') ?? 'https://tasksnearme.com').replace(/\/$/, '');
const asJson = args.includes('--json') ? (args.splice(args.indexOf('--json'), 1), true) : false;
const paths = args.length > 0 ? args : ['/', '/austin', '/austin/tasks', '/austin/furniture-assembly', '/pricing', '/become-a-helper'];

const sizes = new Map();
async function fetchSize(url) {
  if (!sizes.has(url)) {
    sizes.set(url, (async () => {
      const response = await fetch(url, { headers: { 'accept-encoding': 'identity', 'user-agent': 'page-weight (TasksNearMe build check)' } });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      return { raw: body.length, gzip: gzipSync(body).length, text: body.toString('utf8') };
    })());
  }
  return sizes.get(url);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

async function measure(path) {
  const page = await fetchSize(`${base}${path}`);
  const html = page.text;
  const own = (href) => {
    const url = new URL(href, `${base}${path}`);
    return url.origin === new URL(base).origin ? url.href : null;
  };
  const scripts = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => own(match[1])).filter(Boolean))];
  const styles = [...new Set([...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((match) => own(match[1])).filter(Boolean))];
  const scriptSizes = await Promise.all(scripts.map(async (url) => ({ url, ...(await fetchSize(url)) })));
  const styleSizes = await Promise.all(styles.map(async (url) => ({ url, ...(await fetchSize(url)) })));
  const sum = (list, key) => list.reduce((total, item) => total + item[key], 0);
  return {
    path,
    html: { raw: page.raw, gzip: page.gzip },
    js: { files: scripts.length, raw: sum(scriptSizes, 'raw'), gzip: sum(scriptSizes, 'gzip') },
    css: { files: styles.length, raw: sum(styleSizes, 'raw'), gzip: sum(styleSizes, 'gzip') },
    largestScripts: scriptSizes
      .sort((a, b) => b.gzip - a.gzip)
      .slice(0, 5)
      .map((item) => ({ file: new URL(item.url).pathname.split('/').pop(), raw: item.raw, gzip: item.gzip })),
  };
}

const results = [];
for (const path of paths) results.push(await measure(path));

if (asJson) {
  console.log(JSON.stringify({ base, measuredAt: new Date().toISOString(), pages: results }, null, 2));
} else {
  console.log(`${base}, gzipped (raw)`);
  for (const result of results) {
    console.log(
      `${result.path.padEnd(32)} JS ${kb(result.js.gzip).padStart(9)} (${kb(result.js.raw)}, ${result.js.files} files)  ` +
        `CSS ${kb(result.css.gzip)}  HTML ${kb(result.html.gzip)}`,
    );
    console.log(`  largest: ${result.largestScripts.map((item) => `${item.file} ${kb(item.gzip)}`).join(', ')}`);
  }
}
