import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate, minimal, serialize } from '../../scripts/client-messages.mjs';
import { messagesFor, pickMessages } from './catalog';
import { CLIENT_NAMESPACES, type ClientRoute } from './client-namespaces.generated';

/**
 * Per-page message catalogs (completion plan 5.7): each route file's provider holds only the namespaces its client
 * components use. If a check here fails after a UI change, run `node scripts/client-messages.mjs`.
 */

const { routes, problems } = generate();

describe('client namespaces per route file', () => {
  it('are up to date with the imports (node scripts/client-messages.mjs)', () => {
    expect(problems).toEqual([]);
    expect(fs.readFileSync(path.join(process.cwd(), 'src/i18n/client-namespaces.generated.ts'), 'utf8')).toBe(serialize(routes));
  });

  it('are given by every route file whose client components use copy', () => {
    const unwrapped = Object.entries(CLIENT_NAMESPACES)
      .filter(([, namespaces]) => namespaces.length > 0)
      .filter(([route]) => {
        const source = fs.readFileSync(path.join(process.cwd(), 'src/app', route), 'utf8');
        return !source.includes(`withClientMessages('${route}',`) && !source.includes(`<ClientMessages route="${route}">`);
      })
      .map(([route]) => route);
    expect(unwrapped, 'wrap with `export default withClientMessages(\'<route file>\', Page)` from @/i18n/client-messages').toEqual([]);
  });

  it('name namespaces that exist in the catalog', () => {
    const english = messagesFor('en');
    const missing = Object.entries(CLIENT_NAMESPACES).flatMap(([route, namespaces]) =>
      (namespaces as readonly string[]).filter((namespace) => namespace !== '*' && Object.keys(pickMessages(english, [namespace])).length === 0).map((namespace) => `${route}: ${namespace}`),
    );
    expect(missing).toEqual([]);
  });

  it('follow only what a page takes from a barrel, and skip server components', () => {
    // The pricing screen is a server component, so the page ships no messages; @/ui/screens/public's other screens don't count.
    expect(CLIENT_NAMESPACES['[locale]/(public)/pricing/page.tsx']).toEqual([]);
    const uses = (route: ClientRoute, namespace: string) => (CLIENT_NAMESPACES[route] as readonly string[]).some((entry) => entry === namespace || entry.startsWith(`${namespace}.`));
    expect(uses('[locale]/(app)/app/(flow)/bookings/[bookingId]/page.tsx', 'bookingHub')).toBe(true);
    expect(uses('[locale]/(app)/app/(flow)/bookings/[bookingId]/page.tsx', 'landing')).toBe(false);
    expect(uses('[locale]/(landing)/page.tsx', 'landing')).toBe(true);
    expect(uses('[locale]/(landing)/page.tsx', 'bookingHub')).toBe(false);
  });

  it('take only the keys a translator is called with, and the whole namespace when it is passed on', () => {
    // The verification badges call `t('identity')`, `t('phoneMeaning')`…: a market page doesn't carry the ID flow's copy.
    const market: readonly string[] = CLIENT_NAMESPACES['[locale]/(public)/[market]/page.tsx'];
    expect(market).toContain('verification.phoneMeaning');
    expect(market.some((entry) => entry.startsWith('verification.capture') || entry.startsWith('verification.setup') || entry === 'verification')).toBe(false);
  });

  it('keep public pages far below the whole catalog', () => {
    const whole = JSON.stringify(messagesFor('en')).length;
    const publicRoutes = (Object.keys(CLIENT_NAMESPACES) as ClientRoute[]).filter((route) => route.startsWith('[locale]/(public)/') || route.startsWith('[locale]/(landing)/'));
    for (const route of publicRoutes) expect(JSON.stringify(pickMessages(messagesFor('en'), CLIENT_NAMESPACES[route])).length, route).toBeLessThan(whole / 10);
  });
});

describe('pickMessages', () => {
  const messages = { a: { x: 'X', y: { z: 'Z' } }, b: { w: 'W' }, server: { s: 'S' } };

  it('keeps whole namespaces and dotted parts, and nothing else', () => {
    expect(pickMessages(messages, ['b', 'a.y'])).toEqual({ b: { w: 'W' }, a: { y: { z: 'Z' } } });
    expect(pickMessages(messages, ['a.y.z', 'a.x'])).toEqual({ a: { x: 'X', y: { z: 'Z' } } });
  });

  it('keeps everything for "*" and skips what the catalog lacks', () => {
    expect(pickMessages(messages, ['*'])).toBe(messages);
    expect(pickMessages(messages, ['missing', 'a.missing'])).toEqual({});
  });

  it('minimal drops a namespace another one already covers', () => {
    expect(minimal(['forms.fieldErrors', 'forms', 'common', 'common'])).toEqual(['common', 'forms']);
    expect(minimal(['a', '*'])).toEqual(['*']);
  });
});
