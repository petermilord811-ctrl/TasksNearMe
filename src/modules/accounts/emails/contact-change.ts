import { createTranslator } from 'next-intl';
import { CONTACT_REVERT_DAYS, DEFAULT_LOCALE, routes, type AppLocale } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { localizedPath } from '@/shared/locale';
import { emailButton, emailCallout, emailCode, emailLayout, emailOpening, emailParagraph, emailParagraphHtml, emailSection, emailTextLink, esc } from '@/platform/email/layout';
import type { RenderedEmail } from './welcome';

/**
 * Changing the account's email or phone. A new email's code goes to the new address (it proves the person
 * reads it); once the change is made, the old address gets a notice with a "Not you?" link (completion plan
 * 5.23) that secures the account without signing in. A changed phone number gets the same notice by email
 * (it shows only the last 4 digits), and the old number gets the link by text. All of them are security mail: one
 * button, no unsubscribe headers.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }));
const smsFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.sms' }));

export function renderEmailChangeCodeEmail({ code, minutes, email, appUrl, locale = DEFAULT_LOCALE }: { code: string; minutes: number; email: string; appUrl: string; locale?: AppLocale }): RenderedEmail {
  const t = tFor(locale);
  const preheader = t('emailChangeCode.preheader', { minutes });
  const body = emailSection(
    emailOpening(t('emailChangeCode.heading'), { eyebrow: t('emailChangeCode.eyebrow') })
      + emailParagraph(t('emailChangeCode.body', { email }), { top: 12 })
      + emailCode(code, t('emailChangeCode.expires', { minutes }))
      + emailParagraph(t('emailChangeCode.ignore'), { tone: 'muted', size: 14, top: 22 }),
    { top: 40, bottom: 36 },
  );
  return {
    subject: t('emailChangeCode.subject', { code }),
    preheader,
    html: emailLayout({ title: t('emailChangeCode.title'), preheader, appUrl, body, footer: '', lang: locale }),
    text: t('emailChangeCode.text', { email, code, minutes }),
  };
}

/** `revertUrl`: the change's "Not you?" link (contact-revert-token.ts), which works once for `CONTACT_REVERT_DAYS`. */
function changedNotice(kind: 'emailChanged' | 'phoneChanged' | 'signInAdded', values: Record<string, string>, revertUrl: string, appUrl: string, locale: AppLocale): RenderedEmail {
  const t = tFor(locale);
  const helpUrl = `${appUrl}${localizedPath(routes.helpContact(), locale)}`;
  const preheader = t(`${kind}.preheader`, values);
  const body = emailSection(
    emailOpening(t(`${kind}.heading`), { eyebrow: t('securityNotice') })
      + emailParagraph(t(`${kind}.body`, values), { top: 12 })
      + emailCallout(esc(t(`${kind}.notYou`, { days: CONTACT_REVERT_DAYS })), { tone: 'warm', top: 22 })
      + emailButton({ href: revertUrl, label: t(`${kind}.help`), variant: 'dark', top: 24 })
      + emailParagraphHtml(`${esc(t(`${kind}.once`))} ${emailTextLink(helpUrl, t(`${kind}.contact`))}`, { tone: 'muted', size: 14, top: 18 }),
    { top: 40, bottom: 36 },
  );
  return {
    subject: t(`${kind}.subject`),
    preheader,
    html: emailLayout({ title: t(`${kind}.title`), preheader, appUrl, body, footer: '', lang: locale }),
    text: t(`${kind}.text`, { ...values, revertUrl, helpUrl, days: CONTACT_REVERT_DAYS }),
  };
}

/** To the old address, after the account switched to `newEmail`. */
export function renderEmailChangedNotice({ newEmail, revertUrl, appUrl, locale = DEFAULT_LOCALE }: { newEmail: string; revertUrl: string; appUrl: string; locale?: AppLocale }): RenderedEmail {
  return changedNotice('emailChanged', { newEmail }, revertUrl, appUrl, locale);
}

/** To the account's email, after its phone number changed (only the last 4 digits are shown). */
export function renderPhoneChangedNotice({ last4, revertUrl, appUrl, locale = DEFAULT_LOCALE }: { last4: string; revertUrl: string; appUrl: string; locale?: AppLocale }): RenderedEmail {
  return changedNotice('phoneChanged', { last4 }, revertUrl, appUrl, locale);
}

/** A new way to sign in, as the notice names it: Google, Microsoft, or a passkey by the name it was given. */
export type AddedSignInMethod = { kind: 'google' | 'microsoft' } | { kind: 'passkey'; name: string };

/**
 * To the account's email, after a new way to sign in was added to a finished account (security review SEC15): its
 * "Not you?" link signs every device out and removes every way in but the emailed code.
 */
export function renderSignInAddedNotice({ method, revertUrl, appUrl, locale = DEFAULT_LOCALE }: { method: AddedSignInMethod; revertUrl: string; appUrl: string; locale?: AppLocale }): RenderedEmail {
  const t = tFor(locale);
  const label = method.kind === 'passkey' ? t('signInAdded.methods.passkey', { name: method.name }) : t(`signInAdded.methods.${method.kind}`);
  return changedNotice('signInAdded', { method: label }, revertUrl, appUrl, locale);
}

/** The text to the old number after the phone changed: the same "Not you?" link, and nothing about the new number. */
export function renderPhoneChangedText({ revertUrl, locale = DEFAULT_LOCALE }: { revertUrl: string; locale?: AppLocale }): string {
  return smsFor(locale)('phoneChanged', { url: revertUrl, days: CONTACT_REVERT_DAYS });
}
