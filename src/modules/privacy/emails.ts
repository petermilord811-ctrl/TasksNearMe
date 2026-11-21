import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, routes, type AppLocale } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { localizedPath } from '@/shared/locale';
import type { RenderedEmail } from '@/modules/accounts/emails/welcome';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailButton, emailLayout, esc } from '@/platform/email/layout';

/** The last email to an account's address, once the account is deleted (src/modules/privacy/requests.ts). */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails.accountDeleted' }));

export function renderAccountDeletedNotice({ appUrl, locale = DEFAULT_LOCALE }: { appUrl: string; locale?: AppLocale }): RenderedEmail {
  const t = tFor(locale);
  // The public contact form (5.22): a deleted account can't sign in to reach support.
  const helpUrl = `${appUrl}${localizedPath(routes.helpContact(), locale)}`;
  const preheader = t('preheader');
  const body = `<tr><td class="card-pad" style="padding:40px 40px 36px;">
<h1 class="h1 ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.8px;color:${EMAIL_COLORS.ink};">${esc(t('heading'))}</h1>
<p class="muted" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.muted};">${esc(t('body'))}</p>
<p class="muted" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.muted};">${esc(t('kept'))}</p>
<p class="ink" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.ink};">${esc(t('notYou'))}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;"><tr><td>${emailButton({ href: helpUrl, label: t('help'), variant: 'dark' })}</td></tr></table>
</td></tr>`;
  return {
    subject: t('subject'),
    preheader,
    html: emailLayout({ title: t('title'), preheader, appUrl, body, footer: '', lang: locale }),
    text: t('text', { helpUrl }),
  };
}
