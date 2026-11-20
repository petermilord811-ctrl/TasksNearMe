import { createTranslator } from 'next-intl';
import type { AppLocale, AttentionTarget, NotificationTopic, NotificationType } from '@/contracts';
import { DEFAULT_LOCALE, routes } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { localizedPath } from '@/shared/locale';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailButton, emailLayout, esc } from '@/platform/email/layout';
import { isLockedPreference } from './delivery-domain';
import { oneClickUnsubscribeUrl, unsubscribePageUrl } from './unsubscribe';

/**
 * The email for one notification (T-29): the topic, what happened, one next step, and a button to the page
 * it's about. The footer says why it came: receipts and safety emails (bookings, payments) are always on;
 * every other topic carries an unsubscribe link and the one-click `List-Unsubscribe` headers.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.notifications.email' }));

export interface NotificationEmailInput {
  type: NotificationType;
  topic: NotificationTopic;
  /** What happened, already worded ("Your booking for … is confirmed."). */
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

  const body = `<tr><td class="card-pad" style="padding:36px 40px 32px;">
<p style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${EMAIL_COLORS.primary};">${esc(topicName)}</p>
<h1 class="h1 ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:26px;line-height:33px;font-weight:800;letter-spacing:-0.5px;color:${EMAIL_COLORS.ink};">${esc(sentence)}</h1>
${details.map((line) => `<p class="ink" style="margin:12px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.ink};">${esc(line)}</p>`).join('\n')}
${next ? `<p class="muted" style="margin:12px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.muted};">${esc(next)}</p>` : ''}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;"><tr><td>${emailButton({ href: url, label: cta })}</td></tr></table>
</td></tr>`;
  const link = (href: string, label: string) => `<a class="link" href="${esc(href)}" target="_blank" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">${esc(label)}</a>`;
  const footer = `<p style="margin:0;">${esc(locked ? t('lockedFooter') : t('optionalFooter', { topic: t(`topicEmails.${topic}`) }))}</p>
<p style="margin:8px 0 0;">${link(settingsUrl, t('manage'))}${unsubscribeUrl ? ` &nbsp;·&nbsp; ${link(unsubscribeUrl, t('unsubscribe'))}` : ''}</p>`;

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
