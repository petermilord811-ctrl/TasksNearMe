import { describe, expect, it } from 'vitest';
import { cityOpenSkipReason, renderCityOpenEmail, type CityOpenEmailInput } from './city-open';

const base: CityOpenEmailInput = {
  city: 'Gainesville',
  marketSlug: 'gainesville',
  zip: '32601',
  email: 'kim@example.test',
  interest: 'need_help',
  appUrl: 'https://tasksnearme.test',
  unsubscribeUrl: 'https://tasksnearme.test/email/waitlist?token=w.wl_1.abc.sig',
  oneClickUrl: 'https://tasksnearme.test/api/email/waitlist?token=w.wl_1.abc.sig',
};

describe('the email telling the waitlist its city opened (plan 8.3)', () => {
  it('says the city is open, and asks someone who needs help to post a task', () => {
    const email = renderCityOpenEmail(base);
    expect(email.subject).toBe('TasksNearMe is open in Gainesville');
    expect(email.preheader).toBe('Post a task and get offers from helpers near you.');
    expect(email.text).toContain("You joined our waitlist for 32601, and we're there now.");
    expect(email.text).toContain('You pay when you book. Your helper is paid after the task is done.');
    expect(email.text).toContain('Post a task: https://tasksnearme.test/app/tasks/new');
    expect(email.text).toContain('See TasksNearMe in Gainesville: https://tasksnearme.test/gainesville');
    expect(email.html).toContain('href="https://tasksnearme.test/app/tasks/new"');
    expect(email.html).toContain('<html lang="en"');
  });

  it('asks someone who wants to help to become a helper, and someone who wants both to do either', () => {
    const helper = renderCityOpenEmail({ ...base, interest: 'give_help' });
    expect(helper.preheader).toBe('Get verified and send offers on tasks near you.');
    expect(helper.text).toContain('Become a helper: https://tasksnearme.test/become-a-helper');
    expect(helper.text).toContain('See TasksNearMe in Gainesville: https://tasksnearme.test/gainesville');
    expect(helper.text).not.toContain('/app/tasks/new');

    const both = renderCityOpenEmail({ ...base, interest: 'both' });
    expect(both.text).toContain('Post a task: https://tasksnearme.test/app/tasks/new');
    expect(both.text).toContain('Become a helper: https://tasksnearme.test/become-a-helper');
  });

  it('carries the unsubscribe link and the one-click headers, and says why it came', () => {
    const email = renderCityOpenEmail(base);
    expect(email.headers).toEqual({ 'List-Unsubscribe': `<${base.oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(email.text).toContain(`Unsubscribe: ${base.unsubscribeUrl}`);
    expect(email.text).toContain("You're getting this because kim@example.test joined the TasksNearMe waitlist for 32601. It's the only email we send about it.");
    expect(email.html).toContain(`href="${base.unsubscribeUrl.replace(/&/g, '&amp;')}"`);
  });

  it('goes out in the language they joined in, with links to the pages in that language', () => {
    const email = renderCityOpenEmail({ ...base, interest: 'give_help', locale: 'es' });
    expect(email.subject).toBe('TasksNearMe ya está en Gainesville');
    expect(email.text).toContain('Te uniste a nuestra lista de espera para 32601, y ya llegamos.');
    expect(email.text).toContain('Hazte ayudante: https://tasksnearme.test/es/become-a-helper');
    expect(email.text).toContain('Ver TasksNearMe en Gainesville: https://tasksnearme.test/es/gainesville');
    expect(email.text).toContain('Cancelar la suscripción: ');
    expect(email.html).toContain('<html lang="es"');
  });

  it('escapes what people typed', () => {
    const email = renderCityOpenEmail({ ...base, email: 'a<b>@example.test' });
    expect(email.html).toContain('a&lt;b&gt;@example.test');
    expect(email.html).not.toContain('a<b>@example.test');
  });
});

describe('who is skipped at send time', () => {
  const none = { suppressed: false, accountInMarket: false };
  it('sends to an entry that is still subscribed, deliverable and not already in the market', () => {
    expect(cityOpenSkipReason({ unsubscribedAt: null }, none)).toBeNull();
  });

  it('skips the unsubscribed, a bounced or complained address, and an account already in the market', () => {
    expect(cityOpenSkipReason({ unsubscribedAt: new Date() }, none)).toBe('unsubscribed');
    expect(cityOpenSkipReason({ unsubscribedAt: null }, { ...none, suppressed: true })).toBe('email_suppressed');
    expect(cityOpenSkipReason({ unsubscribedAt: null }, { ...none, accountInMarket: true })).toBe('has_account');
  });
});
