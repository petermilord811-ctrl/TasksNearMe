#!/usr/bin/env node
/**
 * Announces every page of the live sitemap to IndexNow (Bing, Yandex, Seznam, Naver, Yep), e.g. right after a
 * deploy. The server's job (src/modules/seo/indexnow-job.ts) then keeps announcing new and changed pages by itself.
 *
 *   node scripts/seo/indexnow.mjs [https://tasksnearme.com]
 *
 * The key is the one in public/<key>.txt (src/modules/seo/indexnow.ts); it must already be live on the site.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = (process.argv[2] ?? 'https://tasksnearme.com').replace(/\/+$/, '');
const keyFile = fs.readdirSync(path.join(root, 'public')).find((name) => /^[0-9a-f]{32}\.txt$/.test(name));
if (!keyFile) throw new Error('No IndexNow key file (public/<32 hex>.txt).');
const key = keyFile.slice(0, -4);

const live = await fetch(`${origin}/${keyFile}`).then((response) => (response.ok ? response.text() : ''));
if (live.trim() !== key) throw new Error(`${origin}/${keyFile} doesn't serve the key yet: deploy first.`);

const xml = await fetch(`${origin}/sitemap.xml`).then((response) => {
  if (!response.ok) throw new Error(`sitemap.xml: HTTP ${response.status}`);
  return response.text();
});
const urls = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]))];
const host = new URL(origin).host;
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation: `${origin}/${keyFile}`, urlList: urls.slice(0, 10_000) }),
});
console.log(`IndexNow: ${urls.length} pages → HTTP ${response.status} ${response.status === 200 || response.status === 202 ? '(accepted)' : await response.text()}`);
if (!response.ok) process.exit(1);
