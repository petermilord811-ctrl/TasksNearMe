import { newId } from '@/platform/db/ids';
import type { Db } from '@/platform/db/connect';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';

/**
 * Email provider port. Development and tests use the dev outbox (rows shown at /dev/outbox);
 * production plugs in Postmark here (docs/blueprint/07 §2) when POSTMARK_SERVER_TOKEN is set.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
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
      });
    },
  };
}

export function createEmailProvider(db: Db): EmailProvider {
  if (process.env.POSTMARK_SERVER_TOKEN) {
    // TODO(integration): Postmark adapter (Phase 10). Until then, refuse to silently drop mail.
    throw new Error('POSTMARK_SERVER_TOKEN is set but the Postmark adapter is not implemented yet.');
  }
  return createDevOutboxEmailProvider(db);
}
