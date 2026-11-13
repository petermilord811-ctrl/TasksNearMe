import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';
import { twilioFromEnv } from './twilio';

export { SmsRejectedError } from './errors';

/**
 * SMS port. Development and tests write texts to the dev outbox (/dev/outbox). With TWILIO_* keys the texts
 * go out through Twilio (`./twilio.ts`); outside production the outbox keeps a copy of each. Production
 * without Twilio refuses to send rather than drop texts.
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

export function createSmsSender(db: Db, env: Record<string, string | undefined> = process.env): SmsSender {
  const twilio = twilioFromEnv(env);
  const production = env.NODE_ENV === 'production';
  if (!twilio) {
    if (!production) return createDevOutboxSmsSender(db);
    return {
      name: 'unconfigured',
      async send() {
        throw new Error('Texts need Twilio in production: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID.');
      },
    };
  }
  if (production) return twilio;
  const outbox = createDevOutboxSmsSender(db);
  return {
    name: twilio.name,
    async send(message) {
      await outbox.send(message);
      // Numbers in the 555 exchange (the seeded and test people) never reach Twilio.
      if (/^\+1\d{3}555\d{4}$/.test(message.to)) return;
      await twilio.send(message);
    },
  };
}
