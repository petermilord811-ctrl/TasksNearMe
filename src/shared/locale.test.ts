import { describe, expect, it } from 'vitest';
import { localizedPath, negotiateLocale, pickLocale, splitLocalePath } from './locale';

describe('splitLocalePath', () => {
  it('finds a language prefix and the path after it', () => {
    expect(splitLocalePath('/es/pricing')).toEqual({ locale: 'es', path: '/pricing' });
    expect(splitLocalePath('/es')).toEqual({ locale: 'es', path: '/' });
    expect(splitLocalePath('/en/app/bookings/bkg_1')).toEqual({ locale: 'en', path: '/app/bookings/bkg_1' });
  });

  it('leaves other paths alone, including ones that only start with the letters', () => {
    expect(splitLocalePath('/')).toBeNull();
    expect(splitLocalePath('/pricing')).toBeNull();
    expect(splitLocalePath('/essentials')).toBeNull();
    expect(splitLocalePath('/fr/pricing')).toBeNull();
  });
});

describe('localizedPath', () => {
  it('prefixes Spanish and leaves English plain', () => {
    expect(localizedPath('/pricing', 'es')).toBe('/es/pricing');
    expect(localizedPath('/', 'es')).toBe('/es');
    expect(localizedPath('/pricing', 'en')).toBe('/pricing');
  });
});

describe('negotiateLocale', () => {
  it('takes the best language we offer, by quality and then order', () => {
    expect(negotiateLocale('es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7')).toBe('es');
    expect(negotiateLocale('en-US,en;q=0.9,es;q=0.8')).toBe('en');
    expect(negotiateLocale('fr-FR,fr;q=0.9,es;q=0.5,en;q=0.4')).toBe('es');
    expect(negotiateLocale('en;q=0.5, es;q=0.8')).toBe('es');
  });

  it('falls back to English for nothing we offer, a wildcard, or no header', () => {
    expect(negotiateLocale('fr-FR,de;q=0.9')).toBe('en');
    expect(negotiateLocale('*')).toBe('en');
    expect(negotiateLocale('')).toBe('en');
    expect(negotiateLocale(null)).toBe('en');
  });

  it('ignores refused and malformed entries', () => {
    expect(negotiateLocale('es;q=0, en;q=0.1')).toBe('en');
    expect(negotiateLocale('es;q=abc, en')).toBe('en');
    expect(negotiateLocale(';;, ,es-419')).toBe('es');
  });
});

describe('pickLocale', () => {
  it('prefers the device’s saved choice over the browser’s languages', () => {
    expect(pickLocale({ cookie: 'es', acceptLanguage: 'en-US' })).toBe('es');
    expect(pickLocale({ cookie: 'en', acceptLanguage: 'es-MX' })).toBe('en');
  });

  it('ignores a cookie that is not one of our languages', () => {
    expect(pickLocale({ cookie: 'klingon', acceptLanguage: 'es-MX' })).toBe('es');
    expect(pickLocale({})).toBe('en');
  });
});
