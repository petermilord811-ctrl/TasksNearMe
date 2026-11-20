import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, routes, type AppLocale, type StaffRole } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailButton, emailLayout, esc } from '@/platform/email/layout';
import type { RenderedEmail } from './welcome';

/**
 * To every admin, when a staff role takes effect (security review SEC19): who has which role now, who granted it, who
 * approved it when a second admin had to, and why. Nobody grants power quietly.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails.staffRoleGranted' }));

export function renderStaffRoleGrantedEmail({
  person,
  email,
  role,
  grantedBy,
  approvedBy,
  reason,
  appUrl,
  locale = DEFAULT_LOCALE,
}: {
  person: string;
  email: string;
  role: StaffRole;
  grantedBy: string;
  approvedBy?: string;
  reason: string;
  appUrl: string;
  locale?: AppLocale;
}): RenderedEmail {
  const t = tFor(locale);
  const values = { person, email, role: t(`roles.${role}`), grantedBy, approvedBy: approvedBy ?? '', reason };
  const who = approvedBy ? t('approved', values) : t('granted', values);
  const preheader = t('preheader', values);
  const staffUrl = `${appUrl}${routes.admin.staff()}`;
  const body = `<tr><td class="card-pad" style="padding:40px 40px 36px;">
<h1 class="h1 ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.8px;color:${EMAIL_COLORS.ink};">${esc(t('heading', values))}</h1>
<p class="muted" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.muted};">${esc(who)}</p>
<p class="ink" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.ink};">${esc(t('reason', values))}</p>
<p class="muted" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.muted};">${esc(t('notYou'))}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;"><tr><td>${emailButton({ href: staffUrl, label: t('open'), variant: 'dark' })}</td></tr></table>
</td></tr>`;
  return {
    subject: t('subject', values),
    preheader,
    html: emailLayout({ title: t('title'), preheader, appUrl, body, footer: '', lang: locale }),
    text: t('text', { ...values, who, staffUrl }),
  };
}
