import { afterEach, describe, expect, it, vi } from 'vitest';
import { botCheckConfig, createBotChecker, STAND_IN_PASS_TOKEN, TURNSTILE_STAND_IN_COOKIE } from './index';
import { createTurnstileChecker, SITEVERIFY_URL, turnstileFromEnv, TurnstileSetupError } from './turnstile';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const KEYS = { TURNSTILE_SITE_KEY: '0x4AAAAAAAsite', TURNSTILE_SECRET_KEY: '0x4AAAAAAAsecret' };
const request = { token: 'tok.en', action: 'sign_in' as const, ip: '203.0.113.9' };

afterEach(() => vi.restoreAllMocks());

describe('Turnstile siteverify', () => {
  it('posts the token, secret, address and an idempotency key, and passes a solved check for this form', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({ success: true, action: 'sign_in', hostname: 'tasksnearme.test' }));
    const checker = createTurnstileChecker('0x4AAAAAAAsecret', fetcher as unknown as typeof fetch);
    expect(await checker.verify(request)).toEqual({ ok: true });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(SITEVERIFY_URL);
    expect(init?.method).toBe('POST');
    const body = Object.fromEntries(new URLSearchParams(String(init?.body)));
    expect(body).toMatchObject({ secret: '0x4AAAAAAAsecret', response: 'tok.en', remoteip: '203.0.113.9' });
    expect(body.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('turns down a token from another form, a bad token, and a used or expired one', async () => {
    const answering = (body: unknown) => createTurnstileChecker('s', (async () => json(body)) as unknown as typeof fetch);
    expect(await answering({ success: true, action: 'post_task' }).verify(request)).toEqual({ ok: false, reason: 'invalid' });
    expect(await answering({ success: false, 'error-codes': ['invalid-input-response'] }).verify(request)).toEqual({ ok: false, reason: 'invalid' });
    expect(await answering({ success: false, 'error-codes': ['timeout-or-duplicate'] }).verify(request)).toEqual({ ok: false, reason: 'expired' });
    expect(await answering({ success: false, 'error-codes': ['missing-input-response'] }).verify(request)).toEqual({ ok: false, reason: 'missing' });
  });

  it('never calls Cloudflare without a token or with one longer than Cloudflare issues', async () => {
    const fetcher = vi.fn();
    const checker = createTurnstileChecker('s', fetcher as unknown as typeof fetch);
    expect(await checker.verify({ ...request, token: undefined })).toEqual({ ok: false, reason: 'missing' });
    expect(await checker.verify({ ...request, token: 'x'.repeat(2049) })).toEqual({ ok: false, reason: 'invalid' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('throws when our secret is wrong, so the setup shows in the logs instead of a bot warning', async () => {
    const checker = createTurnstileChecker('s', (async () => json({ success: false, 'error-codes': ['invalid-input-secret'] })) as unknown as typeof fetch);
    await expect(checker.verify(request)).rejects.toBeInstanceOf(TurnstileSetupError);
  });

  it('retries once with the same key, then lets the request through when Cloudflare is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const keys: string[] = [];
    const down = vi.fn(async (_url: string, init?: RequestInit) => {
      keys.push(new URLSearchParams(String(init?.body)).get('idempotency_key')!);
      return json({ success: false, 'error-codes': ['internal-error'] });
    });
    expect(await createTurnstileChecker('s', down as unknown as typeof fetch).verify(request)).toEqual({ ok: true, degraded: true });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);

    const flaky = vi.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(json({ success: true, action: 'sign_in' }));
    expect(await createTurnstileChecker('s', flaky as unknown as typeof fetch).verify(request)).toEqual({ ok: true });
    expect(await createTurnstileChecker('s', (async () => json({}, 503)) as unknown as typeof fetch).verify(request)).toEqual({ ok: true, degraded: true });
  });

  it('is on with both keys, and refuses one without the other', () => {
    expect(turnstileFromEnv({})).toBeNull();
    expect(turnstileFromEnv(KEYS)?.name).toBe('turnstile');
    expect(() => turnstileFromEnv({ TURNSTILE_SITE_KEY: 'x' })).toThrow(/TURNSTILE_SECRET_KEY/);
    expect(() => turnstileFromEnv({ TURNSTILE_SECRET_KEY: 'x' })).toThrow(/TURNSTILE_SITE_KEY/);
  });
});

describe('which bot check runs', () => {
  it('is the stand-in outside production without keys, or for a test browser that asks', async () => {
    const dev = { NODE_ENV: 'development' };
    expect(createBotChecker(undefined, dev).name).toBe('stand-in');
    expect(botCheckConfig(undefined, dev)).toEqual({ provider: 'stand_in' });
    expect(createBotChecker(undefined, { ...dev, ...KEYS }).name).toBe('turnstile');
    expect(botCheckConfig(undefined, { ...dev, ...KEYS })).toEqual({ provider: 'turnstile', siteKey: KEYS.TURNSTILE_SITE_KEY });
    expect(createBotChecker('1', { ...dev, ...KEYS }).name).toBe('stand-in');
    expect(TURNSTILE_STAND_IN_COOKIE).toBe('tnm_turnstile_stand_in');

    const standIn = createBotChecker(undefined, dev);
    expect(await standIn.verify({ ...request, token: STAND_IN_PASS_TOKEN })).toEqual({ ok: true });
    expect(await standIn.verify({ ...request, token: 'stand-in:fail' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await standIn.verify({ ...request, token: undefined })).toEqual({ ok: false, reason: 'missing' });
  });

  it('is Turnstile in production, and with no keys there every check is refused (never waved through)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const production = { NODE_ENV: 'production' };
    expect(createBotChecker('1', { ...production, ...KEYS }).name).toBe('turnstile');
    expect(botCheckConfig('1', { ...production, ...KEYS })).toEqual({ provider: 'turnstile', siteKey: KEYS.TURNSTILE_SITE_KEY });
    const unconfigured = createBotChecker(undefined, production);
    expect(unconfigured.name).toBe('unconfigured');
    expect(botCheckConfig(undefined, production)).toBeUndefined();
    expect(await unconfigured.verify({ ...request, token: STAND_IN_PASS_TOKEN })).toEqual({ ok: false, reason: 'unconfigured' });
  });
});
