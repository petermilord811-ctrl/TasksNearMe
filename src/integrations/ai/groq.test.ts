import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createGroqWriter, DEFAULT_GROQ_MODELS, groqWritersFromEnv } from './groq';
import { durationMs, retryAfterMs } from './openai-compatible';
import { AiRateLimitedError } from './writer';

const schema = z.object({ title: z.string() });

function stubFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const send = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init!, body: JSON.parse(String(init!.body)) as Record<string, unknown> });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  });
  return { send: send as unknown as typeof fetch, calls };
}

const completion = (content: string) => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the Groq writer', () => {
  it('asks gpt-oss for a strict JSON schema at low reasoning effort, capped with max_completion_tokens', async () => {
    const { send, calls } = stubFetch(200, completion('{"title":"Assemble two bookshelves"}'));
    const writer = createGroqWriter({ apiKey: 'gsk_test', model: 'openai/gpt-oss-120b', fetch: send });
    expect(writer.name).toBe('groq:openai/gpt-oss-120b');
    await expect(writer.write({ system: 'Be brief.', prompt: 'two bookshelves', schema, maxTokens: 1_500 })).resolves.toEqual({ title: 'Assemble two bookshelves' });
    const { url, init, body } = calls[0]!;
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer gsk_test');
    expect(body).toMatchObject({ model: 'openai/gpt-oss-120b', max_completion_tokens: 1_500, reasoning_effort: 'low' });
    expect(body).not.toHaveProperty('max_tokens');
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'answer', schema: z.toJSONSchema(schema), strict: true } });
  });

  it('reads a 429 as its free limit, waiting for the limit that ran out: the daily requests or the tokens a minute', async () => {
    const write = (headers: Record<string, string>) => createGroqWriter({ apiKey: 'k', model: 'm', fetch: stubFetch(429, { error: { message: 'Rate limit reached' } }, headers).send }).write({ system: '', prompt: '', schema });
    await expect(write({ 'retry-after': '7' })).rejects.toMatchObject({ name: 'AiRateLimitedError', retryAfterMs: 7_000, message: 'Groq is at its free limit (HTTP 429)' });
    await expect(write({ 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '2h1m30s', 'x-ratelimit-reset-tokens': '6s' })).rejects.toMatchObject({ retryAfterMs: 7_290_000 });
    await expect(write({ 'x-ratelimit-remaining-requests': '412', 'x-ratelimit-reset-requests': '2h1m30s', 'x-ratelimit-reset-tokens': '7.66s' })).rejects.toMatchObject({ retryAfterMs: 7_660 });
    const unsaid = write({});
    await expect(unsaid).rejects.toBeInstanceOf(AiRateLimitedError);
    await expect(unsaid).rejects.toMatchObject({ retryAfterMs: undefined });
  });
});

describe('waits in a 429', () => {
  it('reads Go-style durations and retry-after in seconds or as a date', () => {
    expect(durationMs('2m59.56s')).toBe(179_560);
    expect(durationMs('7.66s')).toBe(7_660);
    expect(durationMs('1h2m3s')).toBe(3_723_000);
    expect(durationMs('120ms')).toBe(120);
    expect(durationMs('soon')).toBeUndefined();
    expect(durationMs('')).toBeUndefined();
    const now = Date.parse('2026-11-21T10:00:00Z');
    expect(retryAfterMs(new Headers({ 'retry-after': '30' }), now)).toBe(30_000);
    expect(retryAfterMs(new Headers({ 'retry-after': 'Sat, 21 Nov 2026 10:01:30 GMT' }), now)).toBe(90_000);
    expect(retryAfterMs(new Headers(), now)).toBeUndefined();
  });
});

describe('Groq for this environment', () => {
  it('is set up only with a key: gpt-oss-120b then gpt-oss-20b, each its own free allowance, unless GROQ_MODEL says otherwise', async () => {
    expect(groqWritersFromEnv({})).toEqual([]);
    expect(groqWritersFromEnv({ GROQ_API_KEY: ' ' })).toEqual([]);
    expect(groqWritersFromEnv({ GROQ_API_KEY: 'k' }).map((writer) => writer.name)).toEqual(DEFAULT_GROQ_MODELS.map((model) => `groq:${model}`));
    expect(groqWritersFromEnv({ GROQ_API_KEY: 'k', GROQ_MODEL: '', GROQ_BASE_URL: '', GROQ_TIMEOUT_SECONDS: '' })).toHaveLength(2);
    expect(groqWritersFromEnv({ GROQ_API_KEY: 'k', GROQ_MODEL: 'qwen/qwen3.8-27b' }).map((writer) => writer.name)).toEqual(['groq:qwen/qwen3.8-27b']);
    const { send, calls } = stubFetch(200, completion('{"title":"Desk"}'));
    vi.stubGlobal('fetch', send);
    await groqWritersFromEnv({ GROQ_API_KEY: 'k', GROQ_BASE_URL: 'https://groq.example.test/openai/v1/' })[0]!.write({ system: '', prompt: '', schema });
    expect(calls[0]!.url).toBe('https://groq.example.test/openai/v1/chat/completions');
  });

  it('runs in production builds too (no trial-only key, unlike NVIDIA’s)', () => {
    expect(groqWritersFromEnv({ NODE_ENV: 'production', GROQ_API_KEY: 'k' })).toHaveLength(2);
  });
});
