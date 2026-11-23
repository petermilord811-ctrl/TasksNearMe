import { describe, expect, it } from 'vitest';
import type { AppLocale } from '@/contracts';
import { renderSignInCodeEmail } from '@/modules/accounts/emails/sign-in-code';
import { renderWelcomeEmail } from '@/modules/accounts/emails/welcome';
import { renderEmailChangeCodeEmail, renderEmailChangedNotice, renderPhoneChangedNotice, renderSignInAddedNotice } from '@/modules/accounts/emails/contact-change';
import { renderStaffRoleGrantedEmail } from '@/modules/accounts/emails/staff-role';
import { renderCityOpenEmail } from '@/modules/marketing/city-open';
import { renderNotificationEmail } from '@/modules/notifications/emails';
import { renderAccountDeletedNotice } from '@/modules/privacy/emails';
import { renderGiftCardEmail } from '@/modules/rewards/emails';
import { renderPublicSupportReceived, renderSupportEmailReply, renderSupportTranscript } from '@/modules/support/emails';
import { solvedCasePageData } from '@/fixtures';

/**
 * Every email shares one design (the owner's email upgrade, 2026-11-22): a fluid column with Outlook's fixed-width
 * ghost table, dark mode for Apple Mail and Outlook.com, one accessible article with one h1, Outlook-safe buttons and
 * the brand in text. Transactional mail carries no unsubscribe headers (they read as bulk mail); only optional
 * notifications and the waitlist's one-off do, with RFC 8058 one-click.
 */

const APP = 'https://tasksnearme.example';
const revertUrl = `${APP}/account/not-me?token=t`;

function transactional(locale: AppLocale) {
  return {
    welcomeHelper: renderWelcomeEmail({ firstName: 'Maya', email: 'maya@example.test', appUrl: APP, market: 'Gainesville, FL', offer: { amountCents: 5000, redeemWithinDays: 90 }, side: 'helper', locale }),
    welcomePoster: renderWelcomeEmail({ firstName: 'Maya', email: 'maya@example.test', appUrl: APP, market: 'Gainesville, FL', side: 'poster', locale }),
    signInCode: renderSignInCodeEmail({ code: '482913', minutes: 10, appUrl: APP, locale }),
    emailChangeCode: renderEmailChangeCodeEmail({ code: '482913', minutes: 10, email: 'maya.new@example.test', appUrl: APP, locale }),
    emailChanged: renderEmailChangedNotice({ newEmail: 'maya.new@example.test', revertUrl, appUrl: APP, locale }),
    phoneChanged: renderPhoneChangedNotice({ last4: '4417', revertUrl, appUrl: APP, locale }),
    signInAdded: renderSignInAddedNotice({ method: { kind: 'passkey', name: 'MacBook' }, revertUrl, appUrl: APP, locale }),
    staffRole: renderStaffRoleGrantedEmail({ person: 'Ana O.', email: 'ana@example.test', role: 'support_lead', grantedBy: 'Riley P.', approvedBy: 'Sam K.', reason: 'Weekend cover', appUrl: APP, locale }),
    giftCard: renderGiftCardEmail({ firstName: 'Jordan', amountCents: 5000, program: 'welcome', url: 'https://cards.example/redeem/abc', appUrl: APP, locale }),
    supportReceived: renderPublicSupportReceived({ appUrl: APP, locale }),
    supportReply: renderSupportEmailReply({ body: 'We refunded the visit.\n\nThanks for waiting.', staffName: 'Ana O.', appUrl: APP, locale }),
    // A copy of a conversation with support (2026-11-23), at its longest: the newest lines that fit.
    supportTranscript: renderSupportTranscript({ page: { ...solvedCasePageData, events: Array.from({ length: 120 }, (_, index) => ({ ...solvedCasePageData.events[2]!, id: `ev_${index}`, body: 'x'.repeat(1_900) })) }, firstName: 'Maya', appUrl: APP, locale, timeZone: 'America/New_York', now: new Date('2026-11-23T15:00:00.000Z') }),
    accountDeleted: renderAccountDeletedNotice({ appUrl: APP, locale }),
    bookingNotification: renderNotificationEmail({ type: 'booking_confirmed', topic: 'bookings', sentence: 'Ruth A. booked you for Assemble a desk.', target: { kind: 'booking', bookingId: 'bkg_desk' }, url: `${APP}/app/bookings/bkg_desk`, userId: 'usr_jordan', appUrl: APP, locale }),
  };
}

function listMail(locale: AppLocale) {
  return {
    offerNotification: renderNotificationEmail({ type: 'offer_received', topic: 'offers', sentence: 'Jordan T. sent an offer of $60.00 for Assemble a desk.', target: { kind: 'task', taskId: 'tsk_desk' }, url: `${APP}/app/tasks/tsk_desk`, userId: 'usr_maya', appUrl: APP, locale }),
    cityOpen: renderCityOpenEmail({ city: 'Gainesville', marketSlug: 'gainesville', zip: '32601', email: 'maya@example.test', interest: 'both', appUrl: APP, unsubscribeUrl: `${APP}/email/waitlist?token=t`, oneClickUrl: `${APP}/api/email/waitlist?token=t`, locale }),
  };
}

const all = (locale: AppLocale) => ({ ...transactional(locale), ...listMail(locale) }) as Record<string, { html: string; headers?: Record<string, string> }>;

describe('the email design every email shares', () => {
  for (const locale of ['en', 'es'] as const) {
    it.each(Object.keys(all(locale)))(`%s (${locale}): one accessible article with one h1, in the reader's language`, (name) => {
      const { html } = all(locale)[name]!;
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain(`<html lang="${locale}"`);
      expect(html).toContain(`role="article" aria-roledescription="email"`);
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
      for (const img of html.match(/<img [^>]*>/g) ?? []) expect(img).toMatch(/ alt="[^"]+"/);
      // The brand reads with images off.
      expect(html).toContain('>tasks</span>');
    });

    it.each(Object.keys(all(locale)))(`%s (${locale}): holds in Outlook and in dark mode, and stays under Gmail's clipping size`, (name) => {
      const { html } = all(locale)[name]!;
      expect(html).toContain('<!--[if mso]><table role="presentation" align="center" width="600"');
      expect(html).toContain('max-width:600px');
      expect(html).toContain('<meta name="color-scheme" content="light dark">');
      expect(html).toContain('@media (prefers-color-scheme: dark)');
      expect(html).toContain('[data-ogsc]');
      expect(html).toContain('[data-ogsb]');
      // Buttons: a colored cell Outlook paints, with the padded link inside.
      for (const cell of html.match(/<td class="btn-cell[^>]*>/g) ?? []) {
        expect(cell).toMatch(/ bgcolor="#[0-9a-f]{6}"/);
        expect(cell).toContain('mso-padding-alt');
      }
      expect(html).not.toMatch(/href="\//);
      expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(60_000);
    });
  }

  it.each(Object.keys(transactional('en')))('%s: transactional, so no unsubscribe or bulk headers', (name) => {
    const email = transactional('en')[name as keyof ReturnType<typeof transactional>] as { headers?: Record<string, string> };
    expect(email.headers).toBeUndefined();
  });

  it.each(Object.keys(listMail('en')))('%s: optional or list mail, so one-click unsubscribe (RFC 8058)', (name) => {
    const email = listMail('en')[name as keyof ReturnType<typeof listMail>];
    expect(email.headers?.['List-Unsubscribe']).toMatch(/^<https:\/\/tasksnearme\.example\/api\/email\//);
    expect(email.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
