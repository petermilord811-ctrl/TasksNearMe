import { createTranslator } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Copy errors fail the e2e build and only log elsewhere (completion plan 5.19, src/i18n/errors.ts). */

const messages = { cases: { columns: { response: 'Response target' }, count: 'You have {count, plural, one {# case} other {# cases}}' } };

async function handlerFor(e2e: boolean) {
  vi.resetModules();
  vi.stubEnv('TNM_E2E_BUILD', e2e ? '1' : '0');
  return (await import('./errors')).intlOnError;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('in the e2e build', () => {
  it('a wrong key, a key naming a group, or arguments that don’t fit throw', async () => {
    const t = createTranslator({ locale: 'en', messages, namespace: 'cases', onError: await handlerFor(true) });
    expect(() => t('response' as never)).toThrow(/MISSING_MESSAGE/);
    expect(() => t('columns' as never)).toThrow(/INSUFFICIENT_PATH/);
    expect(() => t('count' as never)).toThrow(/FORMATTING_ERROR/);
    expect(t('columns.response')).toBe('Response target');
  });
});

describe('in dev and production', () => {
  it('next-intl’s default stays: log and show the key', async () => {
    const onError = await handlerFor(false);
    expect(onError).toBeUndefined();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = createTranslator({ locale: 'en', messages, namespace: 'cases', onError });
    expect(t('response' as never)).toBe('cases.response');
  });
});
