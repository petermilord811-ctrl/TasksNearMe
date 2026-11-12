import { newId } from '@/platform/db/ids';
import type { Db } from '@/platform/db/connect';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';
import { createPostmarkEmailProvider } from './postmark';

/**
 * Email provider port. Development and tests use the dev outbox (rows shown at /dev/outbox, with the HTML
 * version in a frame); with POSTMARK_SERVER_TOKEN set, every email goes out through Postmark from
 * EMAIL_FROM (docs/integration-points.md).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  /** The plain-text version: always sent, for clients that don't show HTML. */
  text: string;
  /** The designed version. */
  html?: string;
  /** What kind of email it is, e.g. `welcome` or `sign-in-code` (Postmark's tag, for its stats). */
  tag?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

export function createDevOutboxEmailProvider(db: Db): EmailProvider {
  return {
    name: 'dev-outbox',
    async send(message) {
      await db.insert(devOutboxMessages).values({
        id: newId('msg'),
        channel: 'email',
        to: message.to.toLowerCase(),
        subject: message.subject,
        body: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.tag ? { tag: message.tag } : {}),
      });
    },
  };
}

export function createEmailProvider(db: Db, env: Record<string, string | undefined> = process.env): EmailProvider {
  const token = env.POSTMARK_SERVER_TOKEN;
  if (token) {
    const from = env.EMAIL_FROM;
    if (!from) throw new Error('POSTMARK_SERVER_TOKEN is set but EMAIL_FROM is empty: set a sender Postmark has verified.');
    return createPostmarkEmailProvider({ token, from });
  }
  return createDevOutboxEmailProvider(db);
}
