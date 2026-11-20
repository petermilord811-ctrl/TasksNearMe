import type { EmailProvider } from './index';
import { fetchWithTimeout } from './timeout';

/**
 * Resend (resend.com): one API call per email, plain-text and designed versions, the kind as a tag. Handy
 * to get real inbox delivery going quickly: before a domain is verified, Resend sends from
 * `onboarding@resend.dev` to the account owner's own address only; with a verified domain, to anyone.
 */
const ENDPOINT = 'https://api.resend.com/emails';

export function createResendEmailProvider(options: { apiKey: string; from: string; replyTo?: string; fetch?: typeof fetch; timeoutMs?: number }): EmailProvider {
  const send = options.fetch ?? fetch;
  return {
    name: 'resend',
    async send(message) {
      const response = await fetchWithTimeout(send, ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
          ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...(message.tag ? { tags: [{ name: 'kind', value: message.tag.replace(/[^A-Za-z0-9_-]/g, '_') }] } : {}),
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
          ...(message.headers ? { headers: message.headers } : {}),
        }),
      }, 'Resend', options.timeoutMs);
      if (response.ok) return;
      const detail = (await response.json().catch(() => null)) as { name?: string; message?: string } | null;
      throw new Error(`Resend refused the email (HTTP ${response.status}${detail?.name ? `, ${detail.name}` : ''}): ${detail?.message ?? 'no details'}`);
    },
  };
}
