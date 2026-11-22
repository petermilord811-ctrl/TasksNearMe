import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, routes, type AppLocale } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { localizedPath } from '@/shared/locale';
import type { RenderedEmail } from '@/modules/accounts/emails/welcome';
import { emailButton, emailLayout, emailOpening, emailParagraph, emailSection } from '@/platform/email/layout';

/** The last email to an account's address, once the account is deleted (src/modules/privacy/requests.ts). */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails.accountDeleted' }));

export function renderAccountDeletedNotice({ appUrl, locale = DEFAULT_LOCALE }: { appUrl: string; locale?: AppLocale }): RenderedEmail {
  const t = tFor(locale);
  // The public contact form (5.22): a deleted account can't sign in to reach support.
  const helpUrl = `${appUrl}${localizedPath(routes.helpContact(), locale)}`;
  const preheader = t('preheader');
  const body = emailSection(
    emailOpening(t('heading'))
      + emailParagraph(t('body'), { top: 12 })
      + emailParagraph(t('kept'), { tone: 'muted', size: 15, top: 14 })
      + emailParagraph(t('notYou'), { tone: 'ink', weight: 600, top: 18 })
      + emailButton({ href: helpUrl, label: t('help'), variant: 'dark', top: 22 }),
    { top: 40, bottom: 36 },
  );
  return {
    subject: t('subject'),
    preheader,
    html: emailLayout({ title: t('title'), preheader, appUrl, body, footer: '', lang: locale }),
    text: t('text', { helpUrl }),
  };
}
