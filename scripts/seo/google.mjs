#!/usr/bin/env node
/**
 * Google Search Console and Indexing API from the command line, with the owner's service account (no SDK):
 *
 *   node scripts/seo/google.mjs sites                        properties the account can see
 *   node scripts/seo/google.mjs sitemaps                     submitted sitemaps and their status
 *   node scripts/seo/google.mjs submit-sitemap [url]         (re)submit https://tasksnearme.com/sitemap.xml
 *   node scripts/seo/google.mjs inspect <url>...             index status of pages (URL Inspection API)
 *   node scripts/seo/google.mjs queries [days] [filter]      search queries: clicks, impressions, position
 *   node scripts/seo/google.mjs pages [days]                 the same per page
 *   node scripts/seo/google.mjs notify-job <url>             Indexing API: a job posting page was added or changed
 *   node scripts/seo/google.mjs notify-job-removed <url>     Indexing API: a job posting page is gone
 *
 * The Indexing API is for pages with JobPosting structured data only (Google's rule); never use it for others.
 * The key lives outside the repo: GOOGLE_SERVICE_ACCOUNT_FILE, else ~/.config/tasksnearme/google-service-account.json
 * (the owner's service account, an Owner of the Search Console property). Never print or commit it.
 */
import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Google's API front end answers this server's IPv6 address with a bare HTML 403 (since about 2026-11-15; IPv4 works),
// and Node tries IPv6 first: ask DNS for IPv4 addresses first.
dns.setDefaultResultOrder('ipv4first');

export const SITE = 'sc-domain:tasksnearme.com';
export const ORIGIN = 'https://tasksnearme.com';
const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || path.join(os.homedir(), '.config/tasksnearme/google-service-account.json');
const SCOPES = {
  searchConsole: 'https://www.googleapis.com/auth/webmasters',
  indexing: 'https://www.googleapis.com/auth/indexing',
};

const base64url = (input) => Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

const tokens = new Map();

/** An OAuth access token for the service account (JWT bearer grant), cached until a minute before it expires. */
export async function accessToken(scope) {
  const cached = tokens.get(scope);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const key = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({ iss: key.client_email, scope, aud: key.token_uri, iat: now, exp: now + 3600 }),
  )}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  const response = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64url(signature)}` }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`token: HTTP ${response.status} ${body.error ?? ''} ${body.error_description ?? ''}`);
  tokens.set(scope, { token: body.access_token, expires: Date.now() + body.expires_in * 1000 });
  return body.access_token;
}

export async function google(method, url, { scope = SCOPES.searchConsole, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${await accessToken(scope)}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${method} ${url}: HTTP ${response.status} ${data.error?.message ?? text.slice(0, 300)}`);
  return data;
}

const site = encodeURIComponent(SITE);
const day = (offset) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

export const searchConsole = {
  sites: () => google('GET', 'https://www.googleapis.com/webmasters/v3/sites'),
  sitemaps: () => google('GET', `https://www.googleapis.com/webmasters/v3/sites/${site}/sitemaps`),
  submitSitemap: (url = `${ORIGIN}/sitemap.xml`) =>
    google('PUT', `https://www.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${encodeURIComponent(url)}`),
  inspect: (url, languageCode = 'en-US') =>
    google('POST', 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      body: { inspectionUrl: url, siteUrl: SITE, languageCode },
    }),
  /** Search performance; Search Console's data lags by about two days. */
  analytics: ({ days = 28, dimensions = ['query'], filter, rowLimit = 250 } = {}) =>
    google('POST', `https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
      body: {
        startDate: day(days),
        endDate: day(0),
        dimensions,
        rowLimit,
        ...(filter ? { dimensionFilterGroups: [{ filters: [{ dimension: dimensions[0], operator: 'contains', expression: filter }] }] } : {}),
      },
    }),
};

export const indexing = {
  notify: (url, type = 'URL_UPDATED') =>
    google('POST', 'https://indexing.googleapis.com/v3/urlNotifications:publish', { scope: SCOPES.indexing, body: { url, type } }),
};

function summarizeInspection(url, result) {
  const status = result.inspectionResult?.indexStatusResult ?? {};
  return {
    url,
    verdict: status.verdict,
    coverage: status.coverageState,
    indexing: status.indexingState,
    robots: status.robotsTxtState,
    fetch: status.pageFetchState,
    lastCrawl: status.lastCrawlTime,
    googleCanonical: status.googleCanonical,
  };
}

async function main([command, ...args]) {
  switch (command) {
    case 'sites':
      return searchConsole.sites();
    case 'sitemaps':
      return searchConsole.sitemaps();
    case 'submit-sitemap':
      await searchConsole.submitSitemap(args[0]);
      return { submitted: args[0] ?? `${ORIGIN}/sitemap.xml` };
    case 'inspect': {
      const urls = args.length > 0 ? args : [`${ORIGIN}/`];
      const results = [];
      for (const url of urls) results.push(summarizeInspection(url, await searchConsole.inspect(url)));
      return results;
    }
    case 'queries':
      return (await searchConsole.analytics({ days: Number(args[0] ?? 28), filter: args[1] })).rows ?? [];
    case 'pages':
      return (await searchConsole.analytics({ days: Number(args[0] ?? 28), dimensions: ['page'] })).rows ?? [];
    case 'notify-job':
      return indexing.notify(args[0], 'URL_UPDATED');
    case 'notify-job-removed':
      return indexing.notify(args[0], 'URL_DELETED');
    default:
      throw new Error(`Unknown command "${command ?? ''}". See the comment at the top of scripts/seo/google.mjs.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (result) => console.log(JSON.stringify(result, null, 2)),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
