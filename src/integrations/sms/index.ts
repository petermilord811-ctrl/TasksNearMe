import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';

/**
 * SMS port. Development and tests write texts to the dev outbox (/dev/outbox). Production uses
 * Twilio Verify for phone codes (backlog B-011) once TWILIO_* keys exist (see blocked.md).
 */
export interface SmsMessage {
  /** E.164, e.g. "+15125550167". */
  to: string;
  text: string;
}

export interface SmsSender {
  readonly name: string;
  send(message: SmsMessage): Promise<void>;
}

export function createDevOutboxSmsSender(db: Db): SmsSender {
  return {
    name: 'dev-outbox',
    async send(message) {
      await db.insert(devOutboxMessages).values({ id: newId('msg'), channel: 'sms', to: message.to, body: message.text });
    },
  };
}

export function createSmsSender(db: Db): SmsSender {
  if (process.env.TWILIO_ACCOUNT_SID) {
    // TODO(integration): Twilio Verify adapter (Phase 10). Refuse to silently drop texts.
    throw new Error('TWILIO_ACCOUNT_SID is set but the Twilio adapter is not implemented yet.');
  }
  return createDevOutboxSmsSender(db);
}
