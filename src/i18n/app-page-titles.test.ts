import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import enServer from '../../messages/en/app/server.json';
import esServer from '../../messages/es/app/server.json';
import { APP_PAGE_TITLES } from './app-page-titles';

/**
 * Signed-in pages name themselves in the page's language (sweep J-E9): an English string title showed in a Spanish tab
 * and history, and Next's route announcer read it aloud on every navigation. Pages use appPageMetadata (or their
 * screen's own title key) instead.
 */

const APP = fileURLToPath(new URL('../app/[locale]/(app)', import.meta.url));

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return /^(page|layout)\.tsx$/.test(entry.name) ? [full] : [];
  });
}

describe('signed-in page titles', () => {
  it('are never a string in a page or layout', () => {
    const files = routeFiles(APP);
    expect(files.length).toBeGreaterThan(40);
    const literal = files.filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      const start = source.indexOf('export const metadata');
      if (start === -1) return false;
      const statement = source.slice(start, source.indexOf('};', start) + 2);
      return /\btitle:\s*['"`]/.test(statement);
    });
    expect(literal.map((file) => path.relative(APP, file))).toEqual([]);
  });

  it('have every title in English and in Spanish, and no other', () => {
    for (const server of [enServer, esServer]) {
      const titles = (server.meta as { app?: Record<string, string> }).app ?? {};
      expect(Object.keys(titles).sort()).toEqual([...APP_PAGE_TITLES].sort());
      expect(Object.values(titles).filter((title) => title.trim() === '')).toEqual([]);
    }
  });

  it('are each used by one page', () => {
    const used = routeFiles(APP).flatMap((file) => [...fs.readFileSync(file, 'utf8').matchAll(/appPageMetadata\('([a-zA-Z]+)'\)/g)].map((match) => match[1]));
    expect(used.length).toBe(APP_PAGE_TITLES.length);
    expect([...new Set(used)].sort()).toEqual([...APP_PAGE_TITLES].sort());
  });
});
