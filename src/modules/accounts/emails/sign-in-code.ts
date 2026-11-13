import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, type AppLocale } from '@/contracts/locale';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailLayout, esc } from '@/platform/email/layout';
import type { RenderedEmail } from './welcome';

/**
 * The email-code sign-in email: the code large and spaced (easy to read and to copy), how long it works,
 * and what to do if you didn't ask for it. The plain-text version is the same sentence as before.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }));

export function renderSignInCodeEmail({ code, minutes, appUrl, locale = DEFAULT_LOCALE }: { code: string; minutes: number; appUrl: string; locale?: AppLocale }): RenderedEmail {
  const t = tFor(locale);
  const preheader = t('signInCode.preheader', { minutes });
  const body = `<tr><td class="card-pad" style="padding:40px 40px 36px;">
<h1 class="h1 ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.8px;color:${EMAIL_COLORS.ink};">${esc(t('signInCode.heading'))}</h1>
<p class="muted" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.muted};">${esc(t('signInCode.body'))}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 0;"><tr>
<td class="code-box" style="padding:18px 26px;border-radius:18px;background:${EMAIL_COLORS.softOrange};border:1px solid #f6d3bd;">
<span style="font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:38px;line-height:44px;font-weight:700;letter-spacing:10px;color:${EMAIL_COLORS.ink};">${esc(code)}</span>
</td></tr></table>
<p class="ink" style="margin:20px 0 0;font-family:${EMAIL_FONT};font-size:15px;line-height:22px;font-weight:600;color:${EMAIL_COLORS.ink};">${esc(t('signInCode.expires', { minutes }))}</p>
<p class="muted" style="margin:8px 0 0;font-family:${EMAIL_FONT};font-size:14px;line-height:21px;color:${EMAIL_COLORS.muted};">${esc(t('signInCode.ignore'))}</p>
</td></tr>`;
  const css = `@media (prefers-color-scheme: dark) { .code-box { background: #2c1e16 !important; border-color: #4a3324 !important; } .code-box span { color: #f7f1ea !important; } }`;
  return {
    subject: t('signInCode.subject', { code }),
    preheader,
    html: emailLayout({ title: t('signInCode.title'), preheader, appUrl, body, footer: '', css, lang: locale }),
    text: t('signInCode.text', { code, minutes }),
  };
}
