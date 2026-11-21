import { createTranslator } from 'next-intl';
import { CONTACT_REVERT_DAYS, DEFAULT_LOCALE, routes, type AppLocale } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { localizedPath } from '@/shared/locale';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailButton, emailLayout, esc } from '@/platform/email/layout';
import type { RenderedEmail } from './welcome';

/**
 * Changing the account's email or phone. A new email's code goes to the new address (it proves the person
 * reads it); once the change is made, the old address gets a notice with a "Not you?" link (completion plan
 * 5.23) that secures the account without signing in. A changed phone number gets the same notice by email
 * (it shows only the last 4 digits), and the old number gets the link by text.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }));
const smsFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.sms' }));

const heading = (text: string) =>
  `<h1 class="h1 ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.8px;color:${EMAIL_COLORS.ink};">${esc(text)}</h1>`;
const paragraph = (text: string, muted = true) =>
  `<p class="${muted ? 'muted' : 'ink'}" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${muted ? EMAIL_COLORS.muted : EMAIL_COLORS.ink};">${esc(text)}</p>`;

export function renderEmailChangeCodeEmail({ code, minutes, email, appUrl, locale = DEFAULT_LOCALE }: { code: string; minutes: number; email: string; appUrl: string; locale?: AppLocale }): RenderedEmail {
  const t = tFor(locale);
  const preheader = t('emailChangeCode.preheader', { minutes });
  const body = `<tr><td class="card-pad" style="padding:40px 40px 36px;">
${heading(t('emailChangeCode.heading'))}
${paragraph(t('emailChangeCode.body', { email }))}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 0;"><tr>
<td class="code-box" style="padding:18px 26px;border-radius:18px;background:${EMAIL_COLORS.softOrange};border:1px solid #f6d3bd;">
<span style="font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:38px;line-height:44px;font-weight:700;letter-spacing:10px;color:${EMAIL_COLORS.ink};">${esc(code)}</span>
</td></tr></table>
<p class="ink" style="margin:20px 0 0;font-family:${EMAIL_FONT};font-size:15px;line-height:22px;font-weight:600;color:${EMAIL_COLORS.ink};">${esc(t('emailChangeCode.expires', { minutes }))}</p>
<p class="muted" style="margin:8px 0 0;font-family:${EMAIL_FONT};font-size:14px;line-height:21px;color:${EMAIL_COLORS.muted};">${esc(t('emailChangeCode.ignore'))}</p>
</td></tr>`;
  const css = `@media (prefers-color-scheme: dark) { .code-box { background: #2c1e16 !important; border-color: #4a3324 !important; } .code-box span { color: #f7f1ea !important; } }`;
  return {
    subject: t('emailChangeCode.subject', { code }),
    preheader,
    html: emailLayout({ title: t('emailChangeCode.title'), preheader, appUrl, body, footer: '', css, lang: locale }),
    text: t('emailChangeCode.text', { email, code, minutes }),
  };
}

/** `revertUrl`: the change's "Not you?" link (contact-revert-token.ts), which works once for `CONTACT_REVERT_DAYS`. */
function changedNotice(kind: 'emailChanged' | 'phoneChanged' | 'signInAdded', values: Record<string, string>, revertUrl: string, appUrl: string, locale: AppLocale): RenderedEmail {
  const t = tFor(locale);
  const helpUrl = `${appUrl}${localizedPath(routes.helpContact(), locale)}`;
  const preheader = t(`${kind}.preheader`, values);
  const body = `<tr><td class="card-pad" style="padding:40px 40px 36px;">
${heading(t(`${kind}.heading`))}
${paragraph(t(`${kind}.body`, values))}
${paragraph(t(`${kind}.notYou`, { days: CONTACT_REVERT_DAYS }), false)}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;"><tr><td>${emailButton({ href: revertUrl, label: t(`${kind}.help`), variant: 'dark' })}</td></tr></table>
<p class="muted" style="margin:18px 0 0;font-family:${EMAIL_FONT};font-size:14px;line-height:21px;color:${EMAIL_COLORS.muted};">${esc(t(`${kind}.once`))} <a href="${esc(helpUrl)}" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">${esc(t(`${kind}.contact`))}</a></p>
</td></tr>`;
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
