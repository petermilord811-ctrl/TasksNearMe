import { describe, expect, it, vi } from 'vitest';
import { createEmailProvider, isReservedEmailAddress } from './index';
import { createPostmarkEmailProvider } from './postmark';
import { createResendEmailProvider } from './resend';
import { EMAIL_SEND_TIMEOUT_MS, EmailTimeoutError } from './timeout';

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
    // Production without a provider refuses each send (when things break, 2026-11-21): the dev outbox shows no one there.
    expect(createEmailProvider(db, { NODE_ENV: 'production' }).name).toBe('unconfigured');
    expect(createEmailProvider(db, { POSTMARK_SERVER_TOKEN: 't', EMAIL_FROM: 'hello@tasksnearme.example', NODE_ENV: 'production' }).name).toBe('postmark');
    expect(() => createEmailProvider(db, { POSTMARK_SERVER_TOKEN: 't' })).toThrow(/EMAIL_FROM/);
  });

  it('refuses each send in production without a provider, saying what to set', async () => {
    await expect(createEmailProvider({} as never, { NODE_ENV: 'production' }).send(message)).rejects.toThrow(/POSTMARK_SERVER_TOKEN or RESEND_API_KEY/);
  });

  it('sends the reply-to address and extra headers', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    await createPostmarkEmailProvider({ token: 't', from: 'a@b.example', replyTo: 'help@tasksnearme.example', fetch }).send({ ...message, headers: { 'List-Unsubscribe': '<https://x.example/u>' } });
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.ReplyTo).toBe('help@tasksnearme.example');
    expect(body.Headers).toEqual([{ Name: 'List-Unsubscribe', Value: '<https://x.example/u>' }]);
  });
});

describe('where email goes', () => {
  it('never sends to reserved test domains', () => {
    for (const address of ['maya@example.test', 'a@sub.example', 'x@example.com', 'y@mail.example.org', 'z@localhost', 'bad']) expect(isReservedEmailAddress(address)).toBe(true);
    for (const address of ['someone@gmail.com', 'team@tasksnearme.com', 'a@example.co']) expect(isReservedEmailAddress(address)).toBe(false);
  });

  it('outside production keeps a copy in the dev outbox and sends real addresses through the provider', async () => {
    const outbox: unknown[] = [];
    const db = { insert: () => ({ values: async (row: unknown) => { outbox.push(row); } }) } as never;
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    try {
      const provider = createEmailProvider(db, { RESEND_API_KEY: 'k', EMAIL_FROM: 'onboarding@resend.dev' });
      expect(provider.name).toBe('resend+dev-outbox');
      await provider.send({ ...message, to: 'maya@example.test' });
      expect(fetch).not.toHaveBeenCalled();
      await provider.send({ ...message, to: 'robin@gmail.com', idempotencyKey: 'dlv_1' });
      expect(fetch).toHaveBeenCalledOnce();
      expect(new Headers((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get('Idempotency-Key')).toBe('dlv_1');
      expect(outbox).toHaveLength(2);
      // A refusal (e.g. before the domain is verified) is logged, not thrown: the outbox has the copy.
      fetch.mockResolvedValueOnce(new Response(JSON.stringify({ name: 'validation_error', message: 'You can only send testing emails to your own email address.' }), { status: 403 }));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await expect(provider.send({ ...message, to: 'friend@gmail.com' })).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('in production sends only through the provider, and skips reserved addresses', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    try {
      const provider = createEmailProvider({} as never, { RESEND_API_KEY: 'k', EMAIL_FROM: 'hello@tasksnearme.com', NODE_ENV: 'production' });
      expect(provider.name).toBe('resend');
      await provider.send({ ...message, to: 'maya@example.test' });
      expect(fetch).not.toHaveBeenCalled();
      await provider.send({ ...message, to: 'robin@gmail.com' });
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
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
    expect(createEmailProvider(db, { RESEND_API_KEY: 'k', EMAIL_FROM: 'onboarding@resend.dev', NODE_ENV: 'production' }).name).toBe('resend');
    expect(() => createEmailProvider(db, { RESEND_API_KEY: 'k' })).toThrow(/EMAIL_FROM/);
    expect(() => createEmailProvider(db, { RESEND_API_KEY: 'k', POSTMARK_SERVER_TOKEN: 't', EMAIL_FROM: 'x@example.test' })).toThrow(/Both/);
  });
});

describe("a provider that doesn't answer (sweep MN7)", () => {
  /** A provider that hangs: it answers only by failing once the call is given up. */
  const hanging = () =>
    vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })));

  it.each([
    ['Postmark', (fetch: typeof globalThis.fetch) => createPostmarkEmailProvider({ token: 't', from: 'x@example.test', fetch, timeoutMs: 50 })],
    ['Resend', (fetch: typeof globalThis.fetch) => createResendEmailProvider({ apiKey: 'k', from: 'x@example.test', fetch, timeoutMs: 50 })],
  ])('%s is given up after its time limit, as a failure to try again', async (name, make) => {
    const fetch = hanging();
    const error = await make(fetch as unknown as typeof globalThis.fetch).send(message).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EmailTimeoutError);
    expect(error).toMatchObject({ provider: name, message: `${name} didn't answer within 50 ms` });
  }, 3_000);

  it('gives each send 15 seconds by default', async () => {
    expect(EMAIL_SEND_TIMEOUT_MS).toBe(15_000);
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    await createResendEmailProvider({ apiKey: 'k', from: 'x@example.test', fetch }).send(message);
    await createPostmarkEmailProvider({ token: 't', from: 'x@example.test', fetch }).send(message);
    for (const call of fetch.mock.calls as unknown as [string, RequestInit][]) expect(call[1].signal).toBeInstanceOf(AbortSignal);
  });
});
