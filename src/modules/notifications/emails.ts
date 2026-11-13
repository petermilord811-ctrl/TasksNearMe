import { createTranslator } from 'next-intl';
import type { AttentionTarget, NotificationTopic, NotificationType } from '@/contracts';
import { routes } from '@/contracts';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailButton, emailLayout, esc } from '@/platform/email/layout';
import appMessages from '../../../messages/en/app';
import { isLockedPreference } from './delivery-domain';
import { oneClickUnsubscribeUrl, unsubscribePageUrl } from './unsubscribe';

/**
 * The email for one notification (T-29): the topic, what happened, one next step, and a button to the page
 * it's about. The footer says why it came: receipts and safety emails (bookings, payments) are always on;
 * every other topic carries an unsubscribe link and the one-click `List-Unsubscribe` headers.
 */

const t = createTranslator({ locale: 'en', messages: appMessages, namespace: 'server.notifications.email' });

export interface NotificationEmailInput {
  type: NotificationType;
  topic: NotificationTopic;
  /** What happened, already worded ("Your booking for … is confirmed."). */
  sentence: string;
  target: AttentionTarget;
  /** The page it's about (absolute). */
  url: string;
  userId: string;
  appUrl: string;
}

export interface NotificationEmail {
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export function renderNotificationEmail(input: NotificationEmailInput): NotificationEmail {
  const { type, topic, sentence, target, url, userId, appUrl } = input;
  // Not every type has a next step (the sentence says it all).
  const nextKey = `next.${type}` as 'next.offer_received';
  const next = t.has(nextKey) ? t(nextKey) : undefined;
  const cta = t(`cta.${target.kind}`);
  const topicName = t(`topics.${topic}`);
  const locked = isLockedPreference(topic, 'email');
  const settingsUrl = `${appUrl}${routes.app.account()}`;
  const unsubscribeUrl = locked ? undefined : unsubscribePageUrl(appUrl, userId, topic);

  const body = `<tr><td class="card-pad" style="padding:36px 40px 32px;">
<p style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${EMAIL_COLORS.primary};">${esc(topicName)}</p>
<h1 class="h1 ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:26px;line-height:33px;font-weight:800;letter-spacing:-0.5px;color:${EMAIL_COLORS.ink};">${esc(sentence)}</h1>
${next ? `<p class="muted" style="margin:12px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.muted};">${esc(next)}</p>` : ''}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;"><tr><td>${emailButton({ href: url, label: cta })}</td></tr></table>
</td></tr>`;
  const link = (href: string, label: string) => `<a class="link" href="${esc(href)}" target="_blank" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">${esc(label)}</a>`;
  const footer = `<p style="margin:0;">${esc(locked ? t('lockedFooter') : t('optionalFooter', { topic: t(`topicEmails.${topic}`) }))}</p>
<p style="margin:8px 0 0;">${link(settingsUrl, t('manage'))}${unsubscribeUrl ? ` &nbsp;·&nbsp; ${link(unsubscribeUrl, t('unsubscribe'))}` : ''}</p>`;

  const text = [
    sentence,
    ...(next ? [next] : []),
    t('open', { url }),
    unsubscribeUrl ? t('textOptionalFooter', { topic: t(`topicEmails.${topic}`), settingsUrl, unsubscribeUrl }) : t('textLockedFooter', { settingsUrl }),
  ].join('\n\n');

  return {
    subject: sentence,
    text,
    html: emailLayout({ title: sentence, preheader: next ?? sentence, appUrl, body, footer }),
    ...(locked
      ? {}
      : { headers: { 'List-Unsubscribe': `<${oneClickUnsubscribeUrl(appUrl, userId, topic)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
  };
}
