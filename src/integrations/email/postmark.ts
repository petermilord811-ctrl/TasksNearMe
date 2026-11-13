import type { EmailProvider } from './index';

/**
 * Postmark (docs/blueprint/07 §2): one API call per email, on the transactional stream. The plain-text
 * version always goes along with the HTML one. Postmark's own errors (an unverified sender, an inactive
 * recipient) come back as thrown errors with its error code, so callers can log them; nothing is retried
 * here (the notification deliveries retry on their own schedule).
 */
const ENDPOINT = 'https://api.postmarkapp.com/email';

export function createPostmarkEmailProvider(options: { token: string; from: string; replyTo?: string; messageStream?: string; fetch?: typeof fetch }): EmailProvider {
  const send = options.fetch ?? fetch;
  return {
    name: 'postmark',
    async send(message) {
      const response = await send(ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': options.token },
        body: JSON.stringify({
          From: options.from,
          To: message.to,
          Subject: message.subject,
          TextBody: message.text,
          ...(message.html ? { HtmlBody: message.html } : {}),
          ...(message.tag ? { Tag: message.tag } : {}),
          ...(options.replyTo ? { ReplyTo: options.replyTo } : {}),
          ...(message.headers ? { Headers: Object.entries(message.headers).map(([Name, Value]) => ({ Name, Value })) } : {}),
          MessageStream: options.messageStream ?? 'outbound',
        }),
      });
      if (response.ok) return;
      const detail = (await response.json().catch(() => null)) as { ErrorCode?: number; Message?: string } | null;
      throw new Error(`Postmark refused the email (HTTP ${response.status}${detail?.ErrorCode !== undefined ? `, error ${detail.ErrorCode}` : ''}): ${detail?.Message ?? 'no details'}`);
    },
  };
}
