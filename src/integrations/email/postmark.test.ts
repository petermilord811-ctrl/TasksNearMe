import { describe, expect, it, vi } from 'vitest';
import { createEmailProvider } from './index';
import { createPostmarkEmailProvider } from './postmark';

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
