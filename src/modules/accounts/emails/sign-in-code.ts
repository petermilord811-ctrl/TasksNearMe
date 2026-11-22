import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, type AppLocale } from '@/contracts/locale';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { localizedPath } from '@/shared/locale';
import { emailButton, emailCallout, emailCode, emailFooter, emailLayout, emailOpening, emailParagraph, emailSection, esc } from '@/platform/email/layout';
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
 * - Transactional: one button, no unsubscribe headers, nothing else to click.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }));

/** The /code page's link for this code: the code and when it expires (Unix seconds), in the fragment only; in the reader's language. */
export function copyCodeUrl(appUrl: string, code: string, expiresAt: Date, locale: AppLocale = DEFAULT_LOCALE): string {
  const fragment = new URLSearchParams({ c: code, e: String(Math.floor(expiresAt.getTime() / 1000)) });
  return `${appUrl.replace(/\/+$/, '')}${localizedPath('/code', locale)}#${fragment.toString()}`;
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
  const copyUrl = copyCodeUrl(appUrl, code, new Date(now.getTime() + minutes * 60_000), locale);
  const host = new URL(appUrl).host;
  const body = emailSection(
    emailOpening(t('signInCode.heading'), { eyebrow: t('signInCode.eyebrow') })
      + emailParagraph(t('signInCode.body'), { top: 12 })
      + emailCode(code, t('signInCode.expires', { minutes }))
      + emailButton({ href: copyUrl, label: t('signInCode.copy'), variant: 'dark', top: 22, align: 'center' })
      + emailParagraph(t('signInCode.copyHint'), { tone: 'muted', size: 13, top: 12, align: 'center' })
      + emailCallout(`<strong>${esc(t('signInCode.privateTitle'))}</strong> ${esc(t('signInCode.private'))}`, { tone: 'note', top: 28 })
      + emailParagraph(t('signInCode.ignore'), { tone: 'muted', size: 14, top: 18 }),
    { top: 40, bottom: 36 },
  );
  return {
    subject: t('signInCode.subject', { code }),
    preheader,
    html: emailLayout({ title: t('signInCode.title'), preheader, appUrl, body, footer: emailFooter([esc(t('signInCode.footer', { host }))]), lang: locale }),
    text: t('signInCode.text', { code, minutes }),
  };
}
