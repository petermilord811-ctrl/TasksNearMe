import { describe, expect, it } from 'vitest';
import type { AppLocale } from '@/contracts';
import { copyCodeUrl, renderSignInCodeEmail } from '@/modules/accounts/emails/sign-in-code';
import { renderWelcomeEmail } from '@/modules/accounts/emails/welcome';
import { renderEmailChangeCodeEmail, renderEmailChangedNotice, renderPhoneChangedNotice, renderPhoneChangedText, renderSignInAddedNotice } from '@/modules/accounts/emails/contact-change';
import { contactRevertUrl } from '@/modules/accounts/contact-revert-token';
import { renderGiftCardEmail } from '@/modules/rewards/emails';
import { renderAccountDeletedNotice } from '@/modules/privacy/emails';
import { renderPublicSupportReceived, renderSupportEmailReply } from '@/modules/support/emails';

/**
 * Every link in the emails people get opens in the reader's language (sweep MN12, messages pass J-M1): /es/... for a
 * Spanish reader, so the page, sign-in and help come in Spanish on a phone or browser set to English. Notification
 * emails did already; the account, gift card, support and sign-in code emails, and every email's logo, didn't.
 */

const APP = 'https://tasksnearme.example';
const KEY = 'test-key-at-least-32-characters-long!!';
const claim = { id: 'ccr_1', userId: 'usr_maya', kind: 'email' as const, expiresAt: new Date('2026-12-01T00:00:00.000Z') };
const revert = (locale: AppLocale) => contactRevertUrl(APP, claim, { key: KEY, locale });
/** The notices embed the "not me" link they're given (built by contactRevertUrl, checked below). */
const notMe = (locale: AppLocale) => `${APP}${locale === 'es' ? '/es' : ''}/account/not-me?token=t`;

function emails(locale: AppLocale) {
  return {
    signInCode: renderSignInCodeEmail({ code: '482913', minutes: 10, appUrl: APP, locale, now: new Date('2026-11-21T12:00:00.000Z') }),
    welcome: renderWelcomeEmail({ firstName: 'Maya', email: 'maya@example.test', appUrl: APP, market: 'Gainesville, FL', offer: { amountCents: 5000, redeemWithinDays: 90 }, side: 'helper', locale }),
    welcomePoster: renderWelcomeEmail({ firstName: 'Maya', email: 'maya@example.test', appUrl: APP, market: 'Gainesville, FL', side: 'poster', locale }),
    emailChangeCode: renderEmailChangeCodeEmail({ code: '482913', minutes: 10, email: 'maya.new@example.test', appUrl: APP, locale }),
    emailChanged: renderEmailChangedNotice({ newEmail: 'maya.new@example.test', revertUrl: notMe(locale), appUrl: APP, locale }),
    phoneChanged: renderPhoneChangedNotice({ last4: '4417', revertUrl: notMe(locale), appUrl: APP, locale }),
    signInAdded: renderSignInAddedNotice({ method: { kind: 'google' }, revertUrl: notMe(locale), appUrl: APP, locale }),
    giftCard: renderGiftCardEmail({ firstName: 'Jordan', amountCents: 5000, program: 'welcome', url: 'https://cards.example/redeem/abc', appUrl: APP, locale }),
    accountDeleted: renderAccountDeletedNotice({ appUrl: APP, locale }),
    supportReceived: renderPublicSupportReceived({ appUrl: APP, locale }),
    supportReply: renderSupportEmailReply({ body: 'We refunded the visit.', staffName: 'Ana O.', appUrl: APP, locale }),
  };
}

const ownLinks = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!.replaceAll('&amp;', '&')).filter((href) => href.startsWith(APP));
/**
 * Emails with nothing to open (the brand at the top stopped being a link in the 2026-11-22 email upgrade): the
 * email-change code goes into the account page that asked for it.
 */
const NO_LINKS = new Set(['emailChangeCode']);

describe('links in the emails people get (messages pass J-M1)', () => {
  it.each(Object.keys(emails('es')))('%s: every link of ours opens in Spanish for a Spanish reader', (name) => {
    const links = ownLinks(emails('es')[name as keyof ReturnType<typeof emails>].html);
    if (NO_LINKS.has(name)) expect(links).toEqual([]);
    else expect(links.length).toBeGreaterThan(0);
    for (const href of links) expect(href, href).toMatch(new RegExp(`^${APP}/es(/|$|#|\\?)`));
  });

  it.each(Object.keys(emails('en')))('%s: and stays without a language prefix in English', (name) => {
    for (const href of ownLinks(emails('en')[name as keyof ReturnType<typeof emails>].html)) expect(href, href).not.toMatch(new RegExp(`^${APP}/es`));
  });

  it('the copy-code page, the "not me" page and the phone-changed text link in the reader\'s language', () => {
    expect(copyCodeUrl(APP, '482913', new Date('2026-11-21T12:10:00.000Z'), 'es')).toMatch(`${APP}/es/code#c=482913`);
    expect(copyCodeUrl(APP, '482913', new Date('2026-11-21T12:10:00.000Z'))).toMatch(`${APP}/code#c=482913`);
    expect(revert('es')).toMatch(`${APP}/es/account/not-me?token=`);
    expect(revert('en')).toMatch(`${APP}/account/not-me?token=`);
    expect(renderPhoneChangedText({ revertUrl: revert('es'), locale: 'es' })).toContain(`${APP}/es/account/not-me?token=`);
  });
});
