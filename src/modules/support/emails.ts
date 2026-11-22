import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, routes, type AppLocale } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { localizedPath } from '@/shared/locale';
import type { RenderedEmail } from '@/modules/accounts/emails/welcome';
import { emailButton, emailCallout, emailLayout, emailOpening, emailParagraph, emailSection, esc } from '@/platform/email/layout';

/**
 * Emails to a public request's address (completion plan 5.22, ./public-requests.ts): the confirmation, and
 * support's answers. Neither says whether an account uses the address. Replies to them aren't read: the
 * person writes again through the contact form with the same address, which adds to the open case.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }));

/** Right after the form is sent. It doesn't repeat the message. */
export function renderPublicSupportReceived({ appUrl, locale = DEFAULT_LOCALE }: { appUrl: string; locale?: AppLocale }): RenderedEmail {
  const t = tFor(locale);
  const contactUrl = `${appUrl}${localizedPath(routes.helpContact(), locale)}`;
  const preheader = t('supportReceived.preheader');
  const body = emailSection(
    emailOpening(t('supportReceived.heading'))
      + emailParagraph(t('supportReceived.body'), { top: 12 })
      + emailParagraph(t('supportReceived.more'), { top: 14 })
      + emailButton({ href: contactUrl, label: t('supportReceived.contact'), variant: 'dark', top: 26 })
      + emailParagraph(t('supportReceived.notYou'), { tone: 'muted', size: 14, top: 22 }),
    { top: 40, bottom: 36 },
  );
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
    .map((block, index) => `<p style="margin:${index === 0 ? 0 : 12}px 0 0;">${esc(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const body = emailSection(
    emailOpening(t('supportReply.heading'))
      + emailCallout(`${paragraphs}<p style="margin:14px 0 0;font-weight:700;">${esc(t('supportReply.signature', { name: staffName }))}</p>`, { tone: 'quote', top: 22 })
      + emailButton({ href: contactUrl, label: t('supportReply.contact'), variant: 'dark', top: 26 })
      + emailParagraph(t('supportReply.replyHow'), { tone: 'muted', size: 14, top: 18 }),
    { top: 40, bottom: 36 },
  );
  return {
    subject: t('supportReply.subject'),
    preheader,
    html: emailLayout({ title: t('supportReply.title'), preheader, appUrl, body, footer: '', lang: locale }),
    text: t('supportReply.text', { reply: reply.trim(), name: staffName, contactUrl }),
  };
}
