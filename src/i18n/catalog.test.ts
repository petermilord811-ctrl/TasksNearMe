import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import esUi from '../../messages/es/ui';
import { ENGLISH_ONLY, checkCatalogs } from '../../scripts/i18n-check.mjs';
import { layOver, messagesFor } from './catalog';

/**
 * Spanish (blueprint 01, P2). Every message people see has a Spanish version with the same keys, ICU
 * arguments, plural and select options, and tags. Staff tools stay in English (ENGLISH_ONLY).
 * Adding English copy? Add its Spanish in messages/es too (`node scripts/i18n-check.mjs es <namespace>`).
 */

/**
 * Namespaces still changing in English (regular visits, in progress): missing Spanish is allowed here until
 * they settle and are translated. Their existing translations are still checked. Keep this list short.
 */
const PENDING = new Set([
  'actions', 'bookingHub', 'notifications', 'rewards', 'server', 'status', 'thread',
  'series', 'bookings', 'bookingConfirm', 'bookingSheets', 'helperCard', 'clients', 'proposal', 'payments',
]);

describe('Spanish catalogs', () => {
  const report = checkCatalogs({ locales: ['es'] }).es ?? {};

  it('keep English’s keys, arguments, options and tags, and parse', () => {
    const errors = Object.entries(report).flatMap(([ns, { errors }]) => errors.map((error) => `${ns}: ${error}`));
    expect(errors).toEqual([]);
  });

  it('translate every message people see', () => {
    const missing = Object.entries(report)
      .filter(([ns]) => !ENGLISH_ONLY.test(ns) && !PENDING.has(ns))
      .flatMap(([ns, { missing }]) => missing.map((key) => `${ns}.${key}`));
    expect(missing).toEqual([]);
  });

  it('are all loaded', () => {
    const dir = fileURLToPath(new URL('../../messages/es/ui', import.meta.url));
    const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5));
    expect(Object.keys(esUi).sort()).toEqual(files.sort());
  });
});

describe('messagesFor', () => {
  it('gives Spanish where it exists and English everywhere else', () => {
    const es = messagesFor('es');
    const en = messagesFor('en');
    expect(es.shell.postTask).toBe('Publicar una tarea');
    expect(en.shell.postTask).toBe('Post a task');
    // A staff namespace stays in English.
    expect(es.adminHome).toEqual(en.adminHome);
    // The same keys in both, so nothing is ever missing.
    const keys = (tree: object): string[] => Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [k] : keys(v).map((s) => `${k}.${s}`)));
    expect(keys(es)).toEqual(keys(en));
  });
});

describe('layOver', () => {
  it('replaces English strings with translated ones, path by path', () => {
    const english = { a: 'One', b: { c: 'Two', d: 'Three' } };
    expect(layOver(english, { b: { c: 'Dos' } })).toEqual({ a: 'One', b: { c: 'Dos', d: 'Three' } });
  });

  it('ignores blanks, wrong shapes and keys English doesn’t have', () => {
    const english = { a: 'One', b: { c: 'Two' } };
    expect(layOver(english, { a: '  ', b: 'Dos', z: 'Extra' })).toEqual(english);
    expect(layOver(english, null)).toEqual(english);
  });
});
