import { describe, expect, it } from 'vitest';
import { localeHref } from './locale-link';

describe('localeHref', () => {
  it('keeps Spanish pages on Spanish addresses', () => {
    expect(localeHref('/pricing', 'es')).toBe('/es/pricing');
    expect(localeHref('/', 'es')).toBe('/es');
    expect(localeHref('/austin/tasks?sort=newest', 'es')).toBe('/es/austin/tasks?sort=newest');
    expect(localeHref('/?q=1', 'es')).toBe('/es?q=1');
    expect(localeHref('/legal/terms#refunds', 'es')).toBe('/es/legal/terms#refunds');
  });

  it('leaves English plain, and leaves alone what is not an internal page address', () => {
    expect(localeHref('/pricing', 'en')).toBe('/pricing');
    expect(localeHref('#faq', 'es')).toBe('#faq');
    expect(localeHref('https://example.com/x', 'es')).toBe('https://example.com/x');
    expect(localeHref('//cdn.example.com/x', 'es')).toBe('//cdn.example.com/x');
    expect(localeHref('/api/files/abc', 'es')).toBe('/api/files/abc');
    expect(localeHref('/es/pricing', 'es')).toBe('/es/pricing');
    expect(localeHref('/en/pricing', 'es')).toBe('/en/pricing');
  });
});
