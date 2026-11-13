import { describe, expect, it, vi } from 'vitest';
import { createSmsSender, SmsRejectedError } from './index';
import { createTwilioSmsSender, twilioFromEnv } from './twilio';

const json = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Twilio texts', () => {
  it('posts one message from the Messaging Service, signed with the account', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({ sid: 'SM123', status: 'queued' }));
    const sms = createTwilioSmsSender({ accountSid: 'AC123', authToken: 'secret', messagingServiceSid: 'MG456', fetch: fetcher as unknown as typeof fetch });
    await sms.send({ to: '+15125550167', text: '123456 is your TasksNearMe code.' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(init?.headers).toMatchObject({ Authorization: `Basic ${Buffer.from('AC123:secret').toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' });
    const body = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(body)).toEqual({ To: '+15125550167', Body: '123456 is your TasksNearMe code.', MessagingServiceSid: 'MG456' });
  });

  it('uses the sender number when there is no Messaging Service', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({ sid: 'SM1' }));
    await createTwilioSmsSender({ accountSid: 'AC1', authToken: 't', from: '+15125550000', fetch: fetcher as unknown as typeof fetch }).send({ to: '+15125550167', text: 'Hi' });
    expect(new URLSearchParams(String(fetcher.mock.calls[0]![1]?.body)).get('From')).toBe('+15125550000');
  });

  it('tells a number it cannot text from a failure worth retrying', async () => {
    const answering = (body: unknown, status: number) => createTwilioSmsSender({ accountSid: 'AC1', authToken: 't', from: '+15125550000', fetch: (async () => json(body, status)) as unknown as typeof fetch });
    await expect(answering({ code: 21211, message: "The 'To' number is not a valid phone number." }, 400).send({ to: '+15125550001', text: 'x' })).rejects.toMatchObject({ name: 'SmsRejectedError', reason: 'invalid_number', providerCode: 21211 });
    await expect(answering({ code: 21614 }, 400).send({ to: '+15125550001', text: 'x' })).rejects.toBeInstanceOf(SmsRejectedError);
    await expect(answering({ code: 21610 }, 400).send({ to: '+15125550001', text: 'x' })).rejects.toMatchObject({ reason: 'opted_out' });
    await expect(answering({ code: 20429 }, 429).send({ to: '+15125550001', text: 'x' })).rejects.toThrow('Twilio answered 429 (error 20429)');
    await expect(answering({}, 500).send({ to: '+15125550001', text: 'x' })).rejects.not.toBeInstanceOf(SmsRejectedError);
  });

  it('is on with the account, its token and a sender', () => {
    expect(twilioFromEnv({})).toBeNull();
    expect(twilioFromEnv({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_MESSAGING_SERVICE_SID: 'MG1' })?.name).toBe('twilio');
    expect(() => twilioFromEnv({ TWILIO_ACCOUNT_SID: 'AC1' })).toThrow(/TWILIO_AUTH_TOKEN/);
    expect(() => twilioFromEnv({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't' })).toThrow(/TWILIO_MESSAGING_SERVICE_SID/);
  });

  it('refuses to send in production without Twilio, rather than drop the text', async () => {
    const db = {} as Parameters<typeof createSmsSender>[0];
    await expect(createSmsSender(db, { NODE_ENV: 'production' }).send({ to: '+15125550167', text: 'x' })).rejects.toThrow(/Texts need Twilio in production/);
  });
});
