import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENGLISH_ONLY } from '../../scripts/i18n-check.mjs';

/**
 * People's names show as a first name and an initial ("Jordan T."), so a sentence that ended right after one would end
 * in two stops ("…a Jordan T.."). The copy puts the name elsewhere in the sentence instead (Spanish pass, 2026-11-21).
 */

const MESSAGES = fileURLToPath(new URL('../../messages', import.meta.url));
// The arguments that carry a person's display name.
const NAME_THEN_STOP = /\{(helper|client|poster|name|actorName|helperName|clientName|posterName|otherName|person)\}\.(?=$|\s|<|\})/u;
// A first name only ("Hi, I'm {name}."), or a line whose doubled stop is collapsed before it's sent (delivery's endOnce,
// the calendar file's oneStop).
const ALLOWED = new Set(['ui/helperOnboarding.setup.examples.intros.plain', 'app/server.notifications.receipt.told', 'app/server.calendar.description']);

function flatten(value: unknown, prefix: string, out: Map<string, string>): Map<string, string> {
  if (typeof value === 'string') out.set(prefix, value);
  else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) flatten(inner, `${prefix}.${key}`, out);
  return out;
}

function catalog(locale: 'en' | 'es'): Map<string, string> {
  const all = new Map<string, string>();
  for (const folder of ['ui', 'app']) {
    for (const file of fs.readdirSync(`${MESSAGES}/${locale}/${folder}`).filter((name) => name.endsWith('.json'))) {
      const namespace = file.slice(0, -5);
      if (ENGLISH_ONLY.test(namespace)) continue;
      flatten(JSON.parse(fs.readFileSync(`${MESSAGES}/${locale}/${folder}/${file}`, 'utf8')), `${folder}/${namespace}`, all);
    }
  }
  return all;
}

describe('a sentence that ends on a name', () => {
  for (const locale of ['en', 'es'] as const) {
    it(`never ends in two stops (${locale})`, () => {
      const messages = catalog(locale);
      expect(messages.size).toBeGreaterThan(1000);
      const doubled = [...messages].filter(([key, text]) => !ALLOWED.has(key) && NAME_THEN_STOP.test(text)).map(([key, text]) => `${key}: ${text}`);
      expect(doubled).toEqual([]);
    });
  }
});
