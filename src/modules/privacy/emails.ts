import { createTranslator } from 'next-intl';
import { routes } from '@/contracts';
import type { RenderedEmail } from '@/modules/accounts/emails/welcome';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailButton, emailLayout, esc } from '@/platform/email/layout';
import appMessages from '../../../messages/en/app';

/** The last email to an account's address, once the account is deleted (src/modules/privacy/requests.ts). */

const t = createTranslator({ locale: 'en', messages: appMessages, namespace: 'server.emails.accountDeleted' });

export function renderAccountDeletedNotice({ appUrl }: { appUrl: string }): RenderedEmail {
  const helpUrl = `${appUrl}${routes.help()}`;
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
    html: emailLayout({ title: t('title'), preheader, appUrl, body, footer: '' }),
    text: t('text', { helpUrl }),
  };
}
