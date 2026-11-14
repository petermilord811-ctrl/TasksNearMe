import { describe, expect, it } from 'vitest';
import { renderSignInCodeEmail } from './sign-in-code';
import { renderWelcomeEmail, type WelcomeEmailInput } from './welcome';

const base: WelcomeEmailInput = {
  firstName: 'Robin',
  email: 'robin@example.test',
  appUrl: 'https://tasksnearme.example',
  market: 'Austin, TX',
  categories: [
    { slug: 'furniture-assembly', name: 'Furniture assembly' },
    { slug: 'yard-cleanup', name: 'Yard cleanup' },
  ],
};
const offer = { amountCents: 5000, cohortLimit: 100, spotsClaimed: 63, minTaskPriceCents: 4000, windowDays: 60, unlockDays: 7, redeemWithinDays: 90 };

describe('the welcome email', () => {
  it('leads with the founding helper gift card while the program is open', () => {
    const email = renderWelcomeEmail({ ...base, offer });
    expect(email.subject).toBe('Welcome, Robin! Earn a $50 gift card as a founding helper');
    expect(email.preheader).toBe('37 spots are left for our first 100 helpers in Austin, TX. Here is how to claim yours.');
    expect(email.html).toContain('>$50<');
    expect(email.html).toContain('63 of 100 spots claimed');
    expect(email.html).toContain('37 spots left');
    expect(email.html).toContain('Finish your first task of $40 or more');
    expect(email.html).toContain('Redeem within 90 days of unlocking');
    // The spots bar is drawn to the real share (63%).
    expect(email.html).toContain('width="63%"');
  });

  it('links every button and task kind to the app, absolutely', () => {
    const { html, text } = renderWelcomeEmail({ ...base, offer });
    expect(html).toContain('href="https://tasksnearme.example/app/helper/onboarding/profile"');
    expect(html).toContain('href="https://tasksnearme.example/app/tasks/new?category=yard-cleanup"');
    expect(html).toContain('href="https://tasksnearme.example/legal/rewards-terms"');
    expect(html).not.toMatch(/href="\//);
    expect(text).toContain('Claim your spot: https://tasksnearme.example/app/helper/onboarding/profile');
    expect(text).toContain('- Yard cleanup: https://tasksnearme.example/app/tasks/new?category=yard-cleanup');
  });

  it('says nothing about a gift card when the program is off or full', () => {
    const email = renderWelcomeEmail(base);
    expect(email.subject).toBe('Welcome to TasksNearMe, Robin');
    expect(email.html).not.toContain('gift card');
    expect(email.text).not.toContain('gift card');
    expect(email.html).toContain('Become a helper');
    expect(email.html).not.toContain('rewards-terms');
  });

  it('escapes what people typed', () => {
    const email = renderWelcomeEmail({ ...base, firstName: '<script>alert(1)</script>', email: 'a"b@example.test' });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('a&quot;b@example.test');
  });

  it('carries no six-digit number a code reader could mistake for a sign-in code', () => {
    const { text } = renderWelcomeEmail({ ...base, offer });
    expect(text).not.toMatch(/\b\d{6}\b/);
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

  it('copies through /code, with the code and its expiry in the fragment only', () => {
    const { html } = render();
    const expires = Date.parse('2026-11-14T05:10:00Z') / 1000;
    expect(html).toContain(`href="https://tasksnearme.example/code#c=482915&amp;e=${expires}"`);
    expect(html).not.toMatch(/\/code\?/);
    expect(html).toContain('>Copy code</a>');
  });

  it('shows the app icon from the site, with alt text', () => {
    expect(render().html).toContain('<img src="https://tasksnearme.example/icons/icon-192.png?v=2" width="34" height="34" alt="TasksNearMe"');
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
