import { describe, expect, it } from 'vitest';
import type { Db } from '@/platform/db/connect';
import { createDeliveryProviders } from './delivery';

/** Nothing is sent here: the providers are only made, which needs no database. */
const db = {} as Db;

describe('notification delivery providers (when things break, J-O5)', () => {
  it('has no text sender in a production build without Twilio: texts are off there', () => {
    const providers = createDeliveryProviders(db, { NODE_ENV: 'production' });
    expect(providers.sms).toBeNull();
    // Email is unchanged: a production build without a provider still fails each send, so that shows.
    expect(providers.email.name).toBe('unconfigured');
  });

  it('texts through Twilio once its keys are set, and through the dev outbox in development', () => {
    const twilio = { NODE_ENV: 'production', TWILIO_ACCOUNT_SID: 'AC00000000', TWILIO_AUTH_TOKEN: 'token', TWILIO_MESSAGING_SERVICE_SID: 'MG00000000' };
    expect(createDeliveryProviders(db, twilio).sms?.name).toBe('twilio');
    expect(createDeliveryProviders(db, { NODE_ENV: 'development' }).sms?.name).toBe('dev-outbox');
  });
});
