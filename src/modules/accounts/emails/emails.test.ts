import { describe, expect, it } from 'vitest';
import { renderEmailChangedNotice, renderPhoneChangedNotice, renderPhoneChangedText } from './contact-change';
import { renderSignInCodeEmail } from './sign-in-code';
import { renderWelcomeEmail, type WelcomeEmailInput } from './welcome';

const base: WelcomeEmailInput = {
  firstName: 'Robin',
  email: 'robin@example.test',
  appUrl: 'https://tasksnearme.example',
  market: 'Austin, TX',
};
const offer = { amountCents: 5000, redeemWithinDays: 90 };
/** The buttons in an email (emailButton's table). */
const buttons = (html: string) => html.match(/class="btn-table"/g)?.length ?? 0;
/** Every link in an email. */
const links = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]!.replaceAll('&amp;', '&'));

describe('the welcome email (written to stay out of Gmail Promotions, 2026-11-22)', () => {
  it('has a subject and preview line without money, offers or a gift card, in both languages', () => {
    for (const side of ['helper', 'poster', undefined] as const) {
      for (const locale of ['en', 'es'] as const) {
        const email = renderWelcomeEmail({ ...base, offer, ...(side ? { side } : {}), locale });
        for (const line of [email.subject, email.preheader]) {
          expect(line).not.toMatch(/\$|gift|regalo|free|gratis|earn|gana/i);
        }
      }
    }
    expect(renderWelcomeEmail({ ...base, offer, side: 'helper' }).subject).toBe('Welcome to TasksNearMe, Robin');
    expect(renderWelcomeEmail({ ...base, offer, side: 'helper', locale: 'es' }).subject).toBe('Te damos la bienvenida a TasksNearMe, Robin');
  });

  it('gives a helper one button, to helper setup, and the welcome gift card as one plain sentence', () => {
    const email = renderWelcomeEmail({ ...base, offer, side: 'helper' });
    expect(email.preheader).toBe('Your account is ready. Next, set up your helper profile.');
    expect(buttons(email.html)).toBe(1);
    expect(email.html).toContain('href="https://tasksnearme.example/app/helper/onboarding/profile"');
    expect(email.html).toContain('>Set up your helper profile</a>');
    expect(email.html.match(/gift card/g)).toHaveLength(1);
    expect(email.html).toContain('When your phone, ID and background checks pass, you&#39;ll get a $50 gift card as a thank-you.');
    expect(email.text).toContain('Set up your helper profile: https://tasksnearme.example/app/helper/onboarding/profile');
    expect(email.text).toContain("When your phone, ID and background checks pass, you'll get a $50 gift card as a thank-you.");
    // Few links: the button, the help center and the gift card's terms. No task kinds, no second button.
    expect(links(email.html)).toEqual([
      'https://tasksnearme.example/app/helper/onboarding/profile',
      'https://tasksnearme.example/help',
      'https://tasksnearme.example/legal/rewards-terms',
    ]);
    expect(email.html).not.toMatch(/linear-gradient|@keyframes|animation:/);
  });

  it('leaves the phone out where texts don’t go out (plan 9.2)', () => {
    const email = renderWelcomeEmail({ ...base, offer: { ...offer, checks: ['identity', 'background'] }, side: 'helper' });
    expect(email.html).toContain('When your ID and background checks pass');
    expect(email.html).toContain('Your ID and your address, then a background check by Checkr');
    expect(email.text).not.toMatch(/phone/i);
  });

  it('says nothing about a gift card when the program is off', () => {
    const email = renderWelcomeEmail({ ...base, side: 'helper' });
    expect(email.html).not.toContain('gift card');
    expect(email.text).not.toContain('gift card');
    expect(email.html).not.toContain('rewards-terms');
    expect(buttons(email.html)).toBe(1);
  });

  it('gives a poster one button, to posting a task, and doesn’t sell them the helpers’ gift card', () => {
    const email = renderWelcomeEmail({ ...base, offer, side: 'poster' });
    expect(email.preheader).toBe('Your account is ready. Post a task whenever you need a hand.');
    expect(buttons(email.html)).toBe(1);
    expect(email.html).toContain('href="https://tasksnearme.example/app/tasks/new"');
    expect(email.html).not.toMatch(/gift card|rewards-terms|onboarding/);
    expect(email.text).toContain('Post a task: https://tasksnearme.example/app/tasks/new');
    expect(links(email.html)).toEqual(['https://tasksnearme.example/app/tasks/new', 'https://tasksnearme.example/help']);
  });

  it('without a side, opens the app', () => {
    const email = renderWelcomeEmail(base);
    expect(buttons(email.html)).toBe(1);
    expect(email.html).toContain('href="https://tasksnearme.example/app"');
    expect(email.html).toContain('>Open TasksNearMe</a>');
  });

  it('reads the same in Spanish, links included', () => {
    const email = renderWelcomeEmail({ ...base, offer, side: 'helper', locale: 'es' });
    expect(email.html).toContain('<html lang="es"');
    expect(email.html).toContain('¡Te damos la bienvenida, Robin!');
    expect(email.html).toContain('href="https://tasksnearme.example/es/app/helper/onboarding/profile"');
    expect(email.text).toContain('recibirás una tarjeta de regalo de $50 como agradecimiento.');
  });

  it('greets by name and says where it was sent, with the market when there is one', () => {
    const email = renderWelcomeEmail({ ...base, side: 'poster' });
    expect(email.text.startsWith('Welcome, Robin!\n')).toBe(true);
    expect(email.html).toContain('TasksNearMe · Starting close to home in Austin, TX.');
    expect(renderWelcomeEmail({ ...base, market: '', side: 'poster' }).html).not.toContain('Starting close to home');
  });

  it('escapes what people typed', () => {
    const email = renderWelcomeEmail({ ...base, firstName: '<script>alert(1)</script>', email: 'a"b@example.test', side: 'helper' });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('a&quot;b@example.test');
  });

  it('carries no six-digit number a code reader could mistake for a sign-in code', () => {
    for (const side of ['helper', 'poster'] as const) expect(renderWelcomeEmail({ ...base, offer, side }).text).not.toMatch(/\b\d{6}\b/);
  });
});

describe('the sign-in code email', () => {
  const now = new Date('2026-11-14T05:00:00Z');
  const render = () => renderSignInCodeEmail({ code: '482915', minutes: 10, appUrl: 'https://tasksnearme.example', now });

  it('leads with the code: first in the subject, alone on its line in the text, large in the design', () => {
    const email = render();
    expect(email.subject).toBe('482915 is your TasksNearMe code');
    expect(email.text.startsWith('Your TasksNearMe sign-in code:\n\n482915\n')).toBe(true);
    expect(email.text.match(/\b\d{6}\b/g)).toEqual(['482915']);
    expect(email.html).toContain('>482915<');
    expect(email.html).toContain('user-select:all');
    expect(email.html).toContain('Works for 10 minutes, once');
    expect(email.html).toContain('TasksNearMe will never ask for this code');
  });

  it('copies through /code, with the code and its expiry in the fragment only, as its one button', () => {
    const { html } = render();
    const expires = Date.parse('2026-11-14T05:10:00Z') / 1000;
    expect(html).toContain(`href="https://tasksnearme.example/code#c=482915&amp;e=${expires}"`);
    expect(html).not.toMatch(/\/code\?/);
    expect(html).toContain('>Copy code</a>');
    expect(buttons(html)).toBe(1);
    expect(links(html)).toHaveLength(1);
  });

  it('shows the app icon from the site, with alt text, beside the wordmark in text (it reads with images off)', () => {
    const { html } = render();
    expect(html).toContain('<img src="https://tasksnearme.example/icons/icon-192.png?v=2" width="32" height="32" alt="TasksNearMe"');
    expect(html).toContain('>tasks</span><span style="color:#e5508a;">near</span>');
  });
});

describe('the emails in Spanish', () => {
  it('sends the sign-in code in Spanish, marked as Spanish', () => {
    const email = renderSignInCodeEmail({ code: '482915', minutes: 10, appUrl: 'https://tasksnearme.example', locale: 'es' });
    expect(email.subject).toBe('482915 es tu código de TasksNearMe');
    expect(email.text).toContain('482915');
    expect(email.text).toContain('10 minutos');
    expect(email.html).toContain('<html lang="es"');
    expect(renderSignInCodeEmail({ code: '482915', minutes: 10, appUrl: 'https://tasksnearme.example' }).html).toContain('<html lang="en"');
  });
});

describe('the email and phone change notices (completion plan 5.23)', () => {
  const revertUrl = 'https://tasksnearme.example/account/not-me?token=ccr_0123456789abcdef0123456789abcdef.sig';

  it('send the old address the "Not you?" link, with support as a second way', () => {
    const email = renderEmailChangedNotice({ newEmail: 'new@example.test', revertUrl, appUrl: 'https://tasksnearme.example' });
    expect(email.html).toContain(`href="${revertUrl}"`);
    expect(email.html).toContain('This wasn&#39;t me');
    expect(email.html).toContain('Security notice');
    expect(email.html).toContain('href="https://tasksnearme.example/help/contact"');
    expect(email.html).not.toContain('/app/support');
    expect(buttons(email.html)).toBe(1);
    expect(email.text).toContain(`Secure your account within 7 days (the link works once): ${revertUrl}`);
    expect(email.text).toContain('new@example.test');
  });

  it('tell the account about a new phone number with the same link, and text the old number without the new one', () => {
    const email = renderPhoneChangedNotice({ last4: '0182', revertUrl, appUrl: 'https://tasksnearme.example', locale: 'es' });
    expect(email.subject).toBe('Se cambió tu número de teléfono de TasksNearMe');
    expect(email.html).toContain(`href="${revertUrl}"`);
    expect(email.html).toContain('No fui yo');
    expect(email.html).toContain('Aviso de seguridad');
    expect(email.text).toContain(revertUrl);
    expect(renderPhoneChangedText({ revertUrl })).toBe(`TasksNearMe: the phone number on your account was changed. Not you? Secure your account within 7 days: ${revertUrl}`);
    expect(renderPhoneChangedText({ revertUrl, locale: 'es' })).toContain('¿No fuiste tú?');
  });
});
