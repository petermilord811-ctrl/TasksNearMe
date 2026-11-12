import { describe, expect, it, vi } from 'vitest';
import { createEmailProvider } from './index';
import { createPostmarkEmailProvider } from './postmark';
import { createResendEmailProvider } from './resend';

const message = { to: 'robin@example.test', subject: 'Welcome', text: 'Hi Robin', html: '<p>Hi Robin</p>', tag: 'welcome' };

describe('Postmark', () => {
  it('sends one email with both versions, the tag and the server token', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 0, Message: 'OK' }), { status: 200 }));
    await createPostmarkEmailProvider({ token: 'server-token', from: 'TasksNearMe <hello@tasksnearme.example>', fetch }).send(message);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.postmarkapp.com/email');
    expect(new Headers(init.headers).get('X-Postmark-Server-Token')).toBe('server-token');
    expect(JSON.parse(String(init.body))).toEqual({
      From: 'TasksNearMe <hello@tasksnearme.example>',
      To: 'robin@example.test',
      Subject: 'Welcome',
      TextBody: 'Hi Robin',
      HtmlBody: '<p>Hi Robin</p>',
      Tag: 'welcome',
      MessageStream: 'outbound',
    });
  });

  it("throws Postmark's reason when it refuses", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 400, Message: "The 'From' address you supplied is not a Sender Signature." }), { status: 422 }));
    await expect(createPostmarkEmailProvider({ token: 't', from: 'x@example.test', fetch }).send(message)).rejects.toThrow(/HTTP 422, error 400.*Sender Signature/);
  });

  it('is used when its token is set, and needs a sender', () => {
    const db = {} as never;
    expect(createEmailProvider(db, {}).name).toBe('dev-outbox');
    expect(createEmailProvider(db, { POSTMARK_SERVER_TOKEN: 't', EMAIL_FROM: 'hello@tasksnearme.example' }).name).toBe('postmark');
    expect(() => createEmailProvider(db, { POSTMARK_SERVER_TOKEN: 't' })).toThrow(/EMAIL_FROM/);
  });
});

describe('Resend', () => {
  it('sends one email with both versions and the kind as a tag', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }));
    await createResendEmailProvider({ apiKey: 're_key', from: 'TasksNearMe <onboarding@resend.dev>', fetch }).send(message);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer re_key');
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'TasksNearMe <onboarding@resend.dev>',
      to: ['robin@example.test'],
      subject: 'Welcome',
      text: 'Hi Robin',
      html: '<p>Hi Robin</p>',
      tags: [{ name: 'kind', value: 'welcome' }],
    });
  });

  it("throws Resend's reason when it refuses", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ name: 'validation_error', message: 'You can only send testing emails to your own email address.' }), { status: 403 }));
    await expect(createResendEmailProvider({ apiKey: 'k', from: 'onboarding@resend.dev', fetch }).send(message)).rejects.toThrow(/HTTP 403, validation_error.*own email/);
  });

  it('is used when its key is set, and never together with Postmark', () => {
    const db = {} as never;
    expect(createEmailProvider(db, { RESEND_API_KEY: 'k', EMAIL_FROM: 'onboarding@resend.dev' }).name).toBe('resend');
    expect(() => createEmailProvider(db, { RESEND_API_KEY: 'k' })).toThrow(/EMAIL_FROM/);
    expect(() => createEmailProvider(db, { RESEND_API_KEY: 'k', POSTMARK_SERVER_TOKEN: 't', EMAIL_FROM: 'x@example.test' })).toThrow(/Both/);
  });
});

