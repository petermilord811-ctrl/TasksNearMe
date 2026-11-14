#!/usr/bin/env node
/**
 * Draws the link-preview cards (Open Graph / X), 1200×630, one per language:
 *   public/og/tasksnearme-en.png, public/og/tasksnearme-es.png
 * Every public page points at its language's card (src/i18n/metadata.ts, SHARE_IMAGES). Run it again when the
 * brand mark (public/ui/brand/icon.svg) or the tagline (server.meta.site.tagline in messages/<lang>/app/server.json)
 * changes:
 *
 *   node scripts/seo/share-image.mjs
 *
 * It renders with Next's bundled image renderer (Satori and resvg, as `next/og` does), so no browser is needed.
 * The brand fonts are fetched from Google Fonts as static TrueType files (the renderer can't read woff2) and kept
 * in memory only: Bricolage Grotesque for the wordmark and the tagline, DM Sans for the address.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { ImageResponse } from 'next/dist/compiled/@vercel/og/index.node.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SIZE = { width: 1200, height: 630 };
const INK = '#17120E';
const MUTED = '#5B524A';
const CREAM = '#FBF7F2';
// The wordmark's "near" and the tile: the brand's iridescent run (public/ui/brand/logo.svg).
const NEAR = 'linear-gradient(90deg, #FF8A5B 0%, #FF5FA2 45%, #8B5CF6 100%)';

/** One static TrueType instance of a Google font (asked for without a browser, Google Fonts answers with .ttf). */
async function googleFont(family, axes) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${axes}&display=swap`).then((r) => {
    if (!r.ok) throw new Error(`Google Fonts CSS for ${family}: HTTP ${r.status}`);
    return r.text();
  });
  const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/.exec(css)?.[1];
  if (!url) throw new Error(`No TrueType file for ${family} in Google Fonts' answer`);
  const font = await fetch(url);
  if (!font.ok) throw new Error(`${family}: HTTP ${font.status}`);
  return font.arrayBuffer();
}

async function tagline(lang) {
  const messages = JSON.parse(await fs.readFile(path.join(root, 'messages', lang, 'app', 'server.json'), 'utf8'));
  const text = messages?.meta?.site?.tagline;
  if (!text) throw new Error(`messages/${lang}/app/server.json has no meta.site.tagline`);
  return text;
}

const h = React.createElement;

/**
 * The soft brand light behind the words, as on the landing page: one full-card SVG whose glows fade out completely
 * (resvg draws SVG gradients exactly; gradients on shapes clipped by the card left a hard edge).
 */
const GLOW = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="pink" cx="1010" cy="150" r="520" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FF5FA2" stop-opacity="0.30"/>
      <stop offset="0.45" stop-color="#8B5CF6" stop-opacity="0.15"/>
      <stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="peach" cx="120" cy="640" r="470" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FF8A5B" stop-opacity="0.26"/>
      <stop offset="0.5" stop-color="#6C8CFF" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#6C8CFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#pink)"/>
  <rect width="1200" height="630" fill="url(#peach)"/>
</svg>`).toString('base64')}`;

function card({ mark, text }) {
  return h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '76px 84px 70px',
        background: CREAM,
        position: 'relative',
        overflow: 'hidden',
      },
    },
    h('img', { src: GLOW, width: SIZE.width, height: SIZE.height, style: { position: 'absolute', left: 0, top: 0 } }),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 26 } },
      h('img', { src: mark, width: 116, height: 116, style: { borderRadius: 34, boxShadow: '0 18px 40px -18px rgba(139,92,246,0.55)' } }),
      h(
        'div',
        { style: { display: 'flex', fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: 84, letterSpacing: -3.5, color: INK, lineHeight: 1 } },
        h('span', null, 'tasks'),
        h('span', { style: { backgroundImage: NEAR, backgroundClip: 'text', color: 'transparent' } }, 'near'),
        h('span', null, 'me'),
      ),
    ),
    h(
      'div',
      // Narrow enough that both languages break into two even lines, never one word on its own.
      { style: { display: 'flex', maxWidth: 800, fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: 74, letterSpacing: -2.5, lineHeight: 1.04, color: INK } },
      text,
    ),
    h('div', { style: { display: 'flex', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 30, color: MUTED } }, 'tasksnearme.com'),
  );
}

const [display, sans, icon] = await Promise.all([
  googleFont('Bricolage Grotesque', 'opsz,wght@96,800'),
  googleFont('DM Sans', 'opsz,wght@14,500'),
  fs.readFile(path.join(root, 'public/ui/brand/icon.svg')),
]);
const mark = `data:image/svg+xml;base64,${icon.toString('base64')}`;
const fonts = [
  { name: 'Bricolage Grotesque', data: display, weight: 800, style: 'normal' },
  { name: 'DM Sans', data: sans, weight: 500, style: 'normal' },
];

await fs.mkdir(path.join(root, 'public/og'), { recursive: true });
for (const lang of ['en', 'es']) {
  const image = new ImageResponse(card({ mark, text: await tagline(lang) }), { ...SIZE, fonts });
  const out = path.join(root, 'public/og', `tasksnearme-${lang}.png`);
  await fs.writeFile(out, Buffer.from(await image.arrayBuffer()));
  console.log(`${path.relative(root, out)} (${Math.round((await fs.stat(out)).size / 1024)} KB)`);
}
