import { createTranslator } from 'next-intl';
import type { AppLocale, AttentionTarget, NotificationTopic, NotificationType } from '@/contracts';
import { DEFAULT_LOCALE, routes } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { localizedPath } from '@/shared/locale';
import { emailButton, emailFooter, emailFooterLink, emailFooterLinks, emailLayout, emailOpening, emailParagraph, emailSection, esc } from '@/platform/email/layout';
import { isLockedPreference } from './delivery-domain';
import { oneClickUnsubscribeUrl, unsubscribePageUrl } from './unsubscribe';

/**
 * The email for one notification (T-29): the topic, what happened, one next step, and a button to the page
 * it's about. The footer says why it came: receipts and safety emails (bookings, payments) are always on and
 * carry no unsubscribe link or headers; every other topic carries an unsubscribe link and the one-click
 * `List-Unsubscribe` headers (RFC 8058).
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.notifications.email' }));

export interface NotificationEmailInput {
  type: NotificationType;
  topic: NotificationTopic;
  /** What happened, already worded ("Ruth A. booked you for … on Tue, Nov 24 at 9:00 am."). */
  sentence: string;
  /** More about it, a paragraph each, under the sentence (a receipt's refund). */
  details?: readonly string[];
  target: AttentionTarget;
  /** The page it's about (absolute, in the recipient's language). */
  url: string;
  userId: string;
  appUrl: string;
  /** The recipient's language (English when left out). */
  locale?: AppLocale;
}

export interface NotificationEmail {
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export function renderNotificationEmail(input: NotificationEmailInput): NotificationEmail {
  const { type, topic, sentence, details = [], target, url, userId, appUrl, locale = DEFAULT_LOCALE } = input;
  const t = tFor(locale);
  // Not every type has a next step (the sentence says it all).
  const nextKey = `next.${type}` as 'next.offer_received';
  const next = t.has(nextKey) ? t(nextKey) : undefined;
  // A type can name its own button (`ctaFor`: "Leave a review"); otherwise the page it leads to does.
  const ctaKey = `ctaFor.${type}` as 'cta.booking';
  const cta = t.has(ctaKey) ? t(ctaKey) : t(`cta.${target.kind}`);
  const topicName = t(`topics.${topic}`);
  const locked = isLockedPreference(topic, 'email');
  // The footer's links open in the recipient's language too, signed out on any device (sweep MN12).
  const settingsUrl = `${appUrl}${localizedPath(routes.app.account(), locale)}`;
  const unsubscribeUrl = locked ? undefined : unsubscribePageUrl(appUrl, userId, topic, locale);

  const body = emailSection(
    emailOpening(sentence, { eyebrow: topicName, size: 'sentence' })
      + details.map((line) => emailParagraph(line, { tone: 'ink', top: 14 })).join('')
      + (next ? emailParagraph(next, { tone: 'body', top: 14 }) : '')
      + emailButton({ href: url, label: cta, top: 26 }),
    { top: 40, bottom: 36 },
  );
  const footer = emailFooter([
    esc(locked ? t('lockedFooter') : t('optionalFooter', { topic: t(`topicEmails.${topic}`) })),
    emailFooterLinks([emailFooterLink(settingsUrl, t('manage')), unsubscribeUrl ? emailFooterLink(unsubscribeUrl, t('unsubscribe')) : '']),
  ]);

  const text = [
    sentence,
    ...details,
    ...(next ? [next] : []),
    t('open', { url }),
    unsubscribeUrl ? t('textOptionalFooter', { topic: t(`topicEmails.${topic}`), settingsUrl, unsubscribeUrl }) : t('textLockedFooter', { settingsUrl }),
  ].join('\n\n');

  return {
    subject: sentence,
    text,
    html: emailLayout({ title: sentence, preheader: details[0] ?? next ?? sentence, appUrl, body, footer, lang: locale }),
    ...(locked
      ? {}
      : { headers: { 'List-Unsubscribe': `<${oneClickUnsubscribeUrl(appUrl, userId, topic)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
  };
}
