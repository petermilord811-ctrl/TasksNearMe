import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, type AppLocale } from '@/contracts/locale';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailButton, emailLayout, esc } from '@/platform/email/layout';
import type { RenderedEmail } from './welcome';

/**
 * The email-code sign-in email.
 *
 * - The code leads the subject ("482915 is your TasksNearMe code"), so phones show it in the notification and
 *   offer to autofill it.
 * - In the body it stands alone, large and spaced, and one tap selects all of it (`user-select: all`).
 * - Email apps run no JavaScript, so "Copy code" opens /code on the site, which copies it with one tap. The
 *   code and its expiry travel in the link's fragment (`#c=…&e=…`), which browsers never send to a server: it
 *   is in no request or log, and the page wipes it from the address bar.
 * - The plain-text version puts the code first on its own line (tests and code readers take the first six
 *   digits).
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }));

/** The /code page's link for this code: the code and when it expires (Unix seconds), in the fragment only. */
export function copyCodeUrl(appUrl: string, code: string, expiresAt: Date): string {
  const fragment = new URLSearchParams({ c: code, e: String(Math.floor(expiresAt.getTime() / 1000)) });
  return `${appUrl.replace(/\/+$/, '')}/code#${fragment.toString()}`;
}

export function renderSignInCodeEmail({
  code,
  minutes,
  appUrl,
  locale = DEFAULT_LOCALE,
  now = new Date(),
}: {
  code: string;
  minutes: number;
  appUrl: string;
  locale?: AppLocale;
  now?: Date;
}): RenderedEmail {
  const t = tFor(locale);
  const preheader = t('signInCode.preheader', { minutes });
  const copyUrl = copyCodeUrl(appUrl, code, new Date(now.getTime() + minutes * 60_000));
  const host = new URL(appUrl).host;
  const body = `<tr><td class="card-pad-top" style="padding:40px 40px 0;">
<p style="margin:0;font-family:${EMAIL_FONT};font-size:13px;line-height:18px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${EMAIL_COLORS.primary};">${esc(t('signInCode.eyebrow'))}</p>
<h1 class="h1 ink" style="margin:10px 0 0;font-family:${EMAIL_DISPLAY_FONT};font-size:32px;line-height:38px;font-weight:800;letter-spacing:-0.8px;color:${EMAIL_COLORS.ink};">${esc(t('signInCode.heading'))}</h1>
<p class="muted" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.muted};">${esc(t('signInCode.body'))}</p>
</td></tr>
<tr><td class="card-pad-x" style="padding:26px 40px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td class="code-box" align="center" style="padding:26px 16px 22px;border-radius:22px;background:${EMAIL_COLORS.softOrange};border:1px solid #f6d3bd;">
<div class="code ink" style="font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:44px;line-height:52px;font-weight:700;letter-spacing:12px;padding-left:12px;color:${EMAIL_COLORS.ink};-webkit-user-select:all;user-select:all;">${esc(code)}</div>
<div class="muted" style="margin-top:8px;font-family:${EMAIL_FONT};font-size:14px;line-height:20px;font-weight:600;color:${EMAIL_COLORS.muted};">${esc(t('signInCode.expires', { minutes }))}</div>
</td></tr></table>
</td></tr>
<tr><td align="center" class="card-pad-x" style="padding:22px 40px 0;">
${emailButton({ href: copyUrl, label: t('signInCode.copy'), variant: 'dark', arrow: false })}
<p class="muted" style="margin:12px 0 0;font-family:${EMAIL_FONT};font-size:13px;line-height:19px;color:${EMAIL_COLORS.muted};">${esc(t('signInCode.copyHint'))}</p>
</td></tr>
<tr><td class="card-pad" style="padding:30px 40px 36px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td class="note" style="padding:16px 18px;border-radius:16px;background:#f6f1ea;border-left:4px solid ${EMAIL_COLORS.violet};font-family:${EMAIL_FONT};font-size:14px;line-height:21px;color:${EMAIL_COLORS.ink};">
<strong>${esc(t('signInCode.privateTitle'))}</strong> ${esc(t('signInCode.private'))}
</td></tr></table>
<p class="muted" style="margin:18px 0 0;font-family:${EMAIL_FONT};font-size:14px;line-height:21px;color:${EMAIL_COLORS.muted};">${esc(t('signInCode.ignore'))}</p>
</td></tr>`;
  const css = `
  @media (max-width: 620px) {
    .card-pad-top { padding: 30px 22px 0 !important; }
    .card-pad-x { padding-left: 22px !important; padding-right: 22px !important; }
    .code { font-size: 36px !important; letter-spacing: 8px !important; padding-left: 8px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .code-box { background: #2c1e16 !important; border-color: #4a3324 !important; }
    .note { background: #221d18 !important; color: #f7f1ea !important; }
  }`;
  return {
    subject: t('signInCode.subject', { code }),
    preheader,
    html: emailLayout({ title: t('signInCode.title'), preheader, appUrl, body, footer: esc(t('signInCode.footer', { host })), css, lang: locale }),
    text: t('signInCode.text', { code, minutes }),
  };
}
