import { createTranslator } from 'next-intl';
import { routes } from '@/contracts';
import appMessages from '../../../../messages/en/app';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailButton, emailLayout, esc } from '@/platform/email/layout';
import type { RenderedEmail } from './welcome';

/**
 * Changing the account's email or phone. A new email's code goes to the new address (it proves the person
 * reads it); once the change is made, the old address gets a notice with a way to reach support if it
 * wasn't them. A changed phone number gets the same notice by email (texts only show the last 4 digits).
 */

const t = createTranslator({ locale: 'en', messages: appMessages, namespace: 'server.emails' });

const heading = (text: string) =>
  `<h1 class="h1 ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.8px;color:${EMAIL_COLORS.ink};">${esc(text)}</h1>`;
const paragraph = (text: string, muted = true) =>
  `<p class="${muted ? 'muted' : 'ink'}" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${muted ? EMAIL_COLORS.muted : EMAIL_COLORS.ink};">${esc(text)}</p>`;

export function renderEmailChangeCodeEmail({ code, minutes, email, appUrl }: { code: string; minutes: number; email: string; appUrl: string }): RenderedEmail {
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
    html: emailLayout({ title: t('emailChangeCode.title'), preheader, appUrl, body, footer: '', css }),
    text: t('emailChangeCode.text', { email, code, minutes }),
  };
}

function changedNotice(kind: 'emailChanged' | 'phoneChanged', values: Record<string, string>, appUrl: string): RenderedEmail {
  const helpUrl = `${appUrl}${routes.app.support()}`;
  const preheader = t(`${kind}.preheader`, values);
  const body = `<tr><td class="card-pad" style="padding:40px 40px 36px;">
${heading(t(`${kind}.heading`))}
${paragraph(t(`${kind}.body`, values))}
${paragraph(t(`${kind}.notYou`), false)}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;"><tr><td>${emailButton({ href: helpUrl, label: t(`${kind}.help`), variant: 'dark' })}</td></tr></table>
</td></tr>`;
  return {
    subject: t(`${kind}.subject`),
    preheader,
    html: emailLayout({ title: t(`${kind}.title`), preheader, appUrl, body, footer: '' }),
    text: t(`${kind}.text`, { ...values, helpUrl }),
  };
}

/** To the old address, after the account switched to `newEmail`. */
export function renderEmailChangedNotice({ newEmail, appUrl }: { newEmail: string; appUrl: string }): RenderedEmail {
  return changedNotice('emailChanged', { newEmail }, appUrl);
}

/** To the account's email, after its phone number changed (only the last 4 digits are shown). */
export function renderPhoneChangedNotice({ last4, appUrl }: { last4: string; appUrl: string }): RenderedEmail {
  return changedNotice('phoneChanged', { last4 }, appUrl);
}
