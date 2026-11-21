import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, routes, type AppLocale } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { localizedPath } from '@/shared/locale';
import type { RenderedEmail } from '@/modules/accounts/emails/welcome';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailButton, emailLayout, esc } from '@/platform/email/layout';

/**
 * Emails to a public request's address (completion plan 5.22, ./public-requests.ts): the confirmation, and
 * support's answers. Neither says whether an account uses the address. Replies to them aren't read: the
 * person writes again through the contact form with the same address, which adds to the open case.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }));

const heading = (text: string) =>
  `<h1 class="h1 ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.8px;color:${EMAIL_COLORS.ink};">${esc(text)}</h1>`;
const paragraph = (text: string, muted = true) =>
  `<p class="${muted ? 'muted' : 'ink'}" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${muted ? EMAIL_COLORS.muted : EMAIL_COLORS.ink};">${esc(text)}</p>`;
const button = (href: string, label: string) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;"><tr><td>${emailButton({ href, label, variant: 'dark' })}</td></tr></table>`;

/** Right after the form is sent. It doesn't repeat the message. */
export function renderPublicSupportReceived({ appUrl, locale = DEFAULT_LOCALE }: { appUrl: string; locale?: AppLocale }): RenderedEmail {
  const t = tFor(locale);
  const contactUrl = `${appUrl}${localizedPath(routes.helpContact(), locale)}`;
  const preheader = t('supportReceived.preheader');
  const body = `<tr><td class="card-pad" style="padding:40px 40px 36px;">
${heading(t('supportReceived.heading'))}
${paragraph(t('supportReceived.body'))}
${paragraph(t('supportReceived.more'))}
${paragraph(t('supportReceived.notYou'), false)}
${button(contactUrl, t('supportReceived.contact'))}
</td></tr>`;
  return {
    subject: t('supportReceived.subject'),
    preheader,
    html: emailLayout({ title: t('supportReceived.title'), preheader, appUrl, body, footer: '', lang: locale }),
    text: t('supportReceived.text', { contactUrl }),
  };
}

/** Support's answer, as staff wrote it (paragraphs kept), signed with their first name. */
export function renderSupportEmailReply({ body: reply, staffName, appUrl, locale = DEFAULT_LOCALE }: { body: string; staffName: string; appUrl: string; locale?: AppLocale }): RenderedEmail {
  const t = tFor(locale);
  const contactUrl = `${appUrl}${localizedPath(routes.helpContact(), locale)}`;
  const preheader = reply.replace(/\s+/g, ' ').trim().slice(0, 90);
  const paragraphs = reply
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p class="ink" style="margin:14px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.ink};">${esc(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  const body = `<tr><td class="card-pad" style="padding:40px 40px 36px;">
${heading(t('supportReply.heading'))}
${paragraphs}
${paragraph(t('supportReply.signature', { name: staffName }))}
${paragraph(t('supportReply.replyHow'))}
${button(contactUrl, t('supportReply.contact'))}
</td></tr>`;
  return {
    subject: t('supportReply.subject'),
    preheader,
    html: emailLayout({ title: t('supportReply.title'), preheader, appUrl, body, footer: '', lang: locale }),
    text: t('supportReply.text', { reply: reply.trim(), name: staffName, contactUrl }),
  };
}
