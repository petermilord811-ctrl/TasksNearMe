#!/usr/bin/env node
/**
 * UI audit over the preview harness (completion plan 5.10): opens every preview (or the ones matching --filter)
 * at the given widths and reports what screenshots and axe don't:
 *
 *   - tap targets smaller than 24 × 24 CSS px that crowd another target (WCAG 2.2, 2.5.8, with its label, inline
 *     and spacing exceptions, as tests/e2e/support/keyboard.ts counts them); and controls under 44 px tall or wide,
 *     the app's own minimum (`min-h-11`), as notes;
 *   - text that is clipped without meaning to be: a box that hides overflow, holds text, and has more content than
 *     room, with no ellipsis or line clamp;
 *   - content past the right or left edge of the viewport that no clipping or scrolling box contains, and a page
 *     that scrolls sideways.
 *
 * Run it against a server that has the previews (/dev/ui): the dev server, or the e2e build (production with the
 * development helpers on), under the heavy-work lock:
 *
 *   node scripts/heavy.mjs --e2e-build node scripts/ui-audit.mjs                     # every preview, 360 and 1280
 *   node scripts/heavy.mjs node scripts/ui-audit.mjs --base http://127.0.0.1:3000 --filter '^screen-pricing'
 *
 * Options: --base (default http://localhost:3300), --widths 360,1280, --filter <regex on the preview id>,
 * --locale es, --out <file> (JSON report; default artifacts/ui-audit/report[-es].json), --notes (print the
 * under-44 px notes too). Exits 1 when it finds a failure (a small target, clipped text, overflow).
 *
 * It opens a fresh page every 10 previews (a long-lived page grows Chrome's renderer past a gigabyte). Point
 * --base at a server running the current code: `--e2e-build` builds it, but only Playwright's own web server
 * serves that build, so serve it yourself (`next start` on a free loopback port) inside the same heavy command.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};
const base = option('base', process.env.UI_AUDIT_BASE ?? 'http://localhost:3300').replace(/\/$/, '');
const widths = option('widths', '360,1280').split(',').map(Number).filter(Boolean);
const filter = option('filter', null);
const locale = option('locale', null) === 'es' ? 'es' : null;
const out = option('out', `artifacts/ui-audit/report${locale ? `-${locale}` : ''}.json`);
const showNotes = args.includes('--notes');
const prefix = locale ? `/${locale}` : '';

/** Runs in the page: every finding inside the preview's root. */
function audit(rootSelector) {
  const root = document.querySelector(rootSelector);
  if (!root) return { failures: [{ kind: 'missing-root', where: rootSelector }], notes: [] };
  const failures = [];
  const notes = [];
  const viewport = document.documentElement.clientWidth;

  const describe = (element) => {
    const name = (element.getAttribute('aria-label') || element.textContent || element.getAttribute('title') || element.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const id = element.id ? `#${element.id}` : '';
    const role = element.getAttribute('role');
    return `${element.tagName.toLowerCase()}${id}${role ? `[role=${role}]` : ''}${name ? ` "${name}"` : ''}`;
  };
  const hidden = (element) => {
    if (element.closest('[aria-hidden="true"], [inert], [hidden]')) return true;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return true;
    const rect = element.getBoundingClientRect();
    return rect.width === 0 || rect.height === 0;
  };
  // A visually hidden (sr-only) element: 1 px and clipped on purpose.
  const srOnly = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (rect.width <= 1 && rect.height <= 1) || style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)';
  };

  // 1. Tap targets, as WCAG 2.2 counts them (the same rules as tests/e2e/support/keyboard.ts `smallTargets`): a
  // control's labels count as part of it (a radio drawn by its label), and an undersized target passes when a
  // 24 px circle on its centre touches no other target (the spacing exception).
  const interactive = root.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=option], [role=slider]');
  const targets = [];
  for (const element of interactive) {
    if (hidden(element) || srOnly(element)) continue;
    const style = getComputedStyle(element);
    const parent = element.parentElement;
    const inline = element.tagName === 'A' && style.display === 'inline' && parent && (parent.textContent?.trim().length ?? 0) > (element.textContent?.trim().length ?? 0) + 2;
    if (inline) continue;
    // A link stretched over its card by an absolute ::after (the whole card is the target): measure the card.
    const after = getComputedStyle(element, '::after');
    const stretched = after.content !== 'none' && after.position === 'absolute' && element.offsetParent instanceof HTMLElement && element.offsetParent !== document.body;
    const box = stretched ? element.offsetParent.getBoundingClientRect() : element.getBoundingClientRect();
    let { left, top, right, bottom } = box;
    for (const label of element.labels ?? []) {
      const area = label.getBoundingClientRect();
      if (area.width === 0 || area.height === 0) continue;
      left = Math.min(left, area.left); top = Math.min(top, area.top); right = Math.max(right, area.right); bottom = Math.max(bottom, area.bottom);
    }
    targets.push({ element, left, top, right, bottom });
  }
  const undersized = targets.filter((target) => target.right - target.left < 24 || target.bottom - target.top < 24);
  const centre = (target) => ({ x: (target.left + target.right) / 2, y: (target.top + target.bottom) / 2 });
  const distanceToBox = (point, target) => Math.hypot(Math.max(target.left - point.x, 0, point.x - target.right), Math.max(target.top - point.y, 0, point.y - target.bottom));
  const contains = (outer, inner) => outer.left <= inner.left && outer.top <= inner.top && outer.right >= inner.right && outer.bottom >= inner.bottom;
  for (const target of undersized) {
    const point = centre(target);
    const crowded = targets.some((other) => {
      if (other === target || contains(other, target) || contains(target, other) || other.element.contains(target.element) || target.element.contains(other.element)) return false;
      if (undersized.includes(other)) {
        const otherPoint = centre(other);
        return Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y) < 24;
      }
      return distanceToBox(point, other) < 12;
    });
    if (crowded) failures.push({ kind: 'small-target', where: describe(target.element), size: `${Math.round(target.right - target.left)}×${Math.round(target.bottom - target.top)}` });
  }
  for (const target of targets) {
    const width = target.right - target.left;
    const height = target.bottom - target.top;
    if (width >= 24 && height >= 24 && (width < 44 || height < 44)) notes.push({ kind: 'under-44', where: describe(target.element), size: `${Math.round(width)}×${Math.round(height)}` });
  }

  // 2. Clipped text.
  for (const element of root.querySelectorAll('*')) {
    if (element.matches('svg, svg *, img, video, canvas, iframe, input, textarea, select, option') || hidden(element) || srOnly(element)) continue;
    const style = getComputedStyle(element);
    const clipsX = ['hidden', 'clip'].includes(style.overflowX);
    const clipsY = ['hidden', 'clip'].includes(style.overflowY);
    if (!clipsX && !clipsY) continue;
    const ownText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0);
    if (!ownText) continue;
    if (style.textOverflow === 'ellipsis' || (style.webkitLineClamp && style.webkitLineClamp !== 'none')) continue;
    const overX = clipsX && element.scrollWidth > element.clientWidth + 1;
    const overY = clipsY && element.scrollHeight > element.clientHeight + 1;
    if (overX || overY) failures.push({ kind: 'clipped-text', where: describe(element), size: `${element.clientWidth}×${element.clientHeight} holds ${element.scrollWidth}×${element.scrollHeight}` });
  }

  // 3. Past the viewport, with no box that clips or scrolls it.
  const contained = (element) => {
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) {
        const box = parent.getBoundingClientRect();
        if (box.right <= viewport + 1 && box.left >= -1) return true;
      }
    }
    return false;
  };
  for (const element of root.querySelectorAll('*')) {
    if (element.matches('svg *') || hidden(element) || srOnly(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.right <= viewport + 1 && rect.left >= -1) continue;
    if (getComputedStyle(element).position === 'fixed' || contained(element)) continue;
    // Report the outermost offender only.
    const parent = element.parentElement;
    if (parent) {
      const outer = parent.getBoundingClientRect();
      if ((outer.right > viewport + 1 || outer.left < -1) && !contained(parent)) continue;
    }
    failures.push({ kind: 'past-viewport', where: describe(element), size: `${Math.round(rect.left)}..${Math.round(rect.right)} of ${viewport}` });
  }
  if (document.documentElement.scrollWidth > viewport + 1) failures.push({ kind: 'page-scrolls-sideways', where: 'document', size: `${document.documentElement.scrollWidth} of ${viewport}` });
  return { failures, notes };
}

// A fresh page every 10 previews: Chrome's renderer grows about 16 MB per preview (measured 2026-11-14: one page
// peaked at 2.2 GB, every 25 at 973 MB, every 10 at 689 MB, in the same time).
const PAGE_LIFE = 10;
const browser = await chromium.launch();
const report = [];
let failed = 0;
try {
  const context = await browser.newContext({ viewport: { width: widths[0], height: 900 } });
  let page = await context.newPage();
  await page.goto(`${base}${prefix}/dev/ui`, { timeout: 120_000 });
  let ids = await page.locator('[data-preview-id]').evaluateAll((links) => links.map((link) => link.getAttribute('data-preview-id') ?? ''));
  if (filter) ids = ids.filter((id) => new RegExp(filter).test(id));
  console.log(`ui-audit: ${ids.length} previews × ${widths.join(', ')} px${locale ? ` (${locale})` : ''} on ${base}`);
  let visited = 0;
  for (const width of widths) {
    for (const id of ids) {
      if (visited > 0 && visited % PAGE_LIFE === 0) {
        await page.close();
        page = await context.newPage();
      }
      visited += 1;
      await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
      const url = `${base}${prefix}/dev/ui/${id.split('/').map(encodeURIComponent).join('/')}`;
      try {
        await page.goto(url, { timeout: 60_000 });
        const root = `[data-preview-root="${id}"]`;
        await page.locator(root).waitFor({ timeout: 30_000 });
        await page.waitForTimeout(250);
        const { failures, notes } = await page.evaluate(audit, root);
        report.push({ id, width, failures, notes });
        if (failures.length || (showNotes && notes.length)) {
          console.log(`\n${width} ${id}`);
          for (const finding of failures) console.log(`  ✗ ${finding.kind}: ${finding.where} (${finding.size})`);
          if (showNotes) for (const finding of notes) console.log(`  · ${finding.kind}: ${finding.where} (${finding.size})`);
        }
        failed += failures.length;
      } catch (error) {
        report.push({ id, width, failures: [{ kind: 'error', where: String(error.message ?? error).split('\n')[0] }], notes: [] });
        console.log(`\n${width} ${id}\n  ✗ error: ${String(error.message ?? error).split('\n')[0]}`);
        failed += 1;
      }
    }
  }
} finally {
  await browser.close();
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
const count = (kind) => report.reduce((sum, row) => sum + row.failures.filter((finding) => finding.kind === kind).length, 0);
const notes = report.reduce((sum, row) => sum + row.notes.length, 0);
console.log(`\nui-audit: ${failed} failures (small targets ${count('small-target')}, clipped text ${count('clipped-text')}, past the viewport ${count('past-viewport')}, sideways pages ${count('page-scrolls-sideways')}, errors ${count('error')}); ${notes} under-44 notes. Report: ${out}`);
process.exit(failed > 0 ? 1 : 0);
