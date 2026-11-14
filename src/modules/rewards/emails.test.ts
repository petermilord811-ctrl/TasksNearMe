import { describe, expect, it } from 'vitest';
import { renderGiftCardEmail } from './emails';

/** The gift card email in both languages: the page language, the greeting by program, and no stand-in name. */
const base = { amountCents: 5000, url: 'https://cards.example.test/c/abc', appUrl: 'https://app.example.test' };

describe('the gift card email', () => {
  it('is in the recipient’s language, html included', () => {
    const email = renderGiftCardEmail({ ...base, firstName: 'Sam', program: 'repeat', locale: 'es' });
    expect(email.html).toContain('<html lang="es"');
    expect(email.subject).toBe('Tu tarjeta de regalo de $50.00 está lista');
    expect(email.text).toContain('Gracias por ayudar a tus vecinos, Sam. Tu tarjeta de regalo de $50.00 por ser cliente recurrente está lista: https://cards.example.test/c/abc');
  });

  it('welcomes rather than thanks for a welcome card, which can come before any task', () => {
    const email = renderGiftCardEmail({ ...base, firstName: 'Sam', program: 'welcome' });
    expect(email.text).toMatch(/^Welcome aboard, Sam\. Your \$50\.00 /);
    expect(email.html).not.toContain('Thanks for helping');
  });

  it('leaves the name out when there is none, in either language', () => {
    for (const locale of ['en', 'es'] as const) {
      const email = renderGiftCardEmail({ ...base, firstName: '', program: 'completion', locale });
      expect(email.text).not.toMatch(/there|, \./);
      expect(email.text.startsWith(locale === 'en' ? 'Thanks for helping your neighbors. ' : 'Gracias por ayudar a tus vecinos. ')).toBe(true);
    }
  });
});
