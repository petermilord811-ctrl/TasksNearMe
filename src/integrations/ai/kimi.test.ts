import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createClaudeWriter, type ClaudeClient } from './claude';
import { createKimiWriter, DEFAULT_KIMI_MODEL, kimiWriterFromEnv } from './kimi';
import { createAiOfferWriter, type OfferFacts } from './offer-writer';
import { AiRefusedError, AiUnavailableError } from './writer';

/** A fetch that answers with one chat completion: its message's `content`, or the `body` and `status` given. */
function stubFetch(reply: { status?: number; body?: unknown; content?: string; finish?: string; refusal?: string } = {}) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const send = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init!, body: JSON.parse(String(init!.body)) as Record<string, unknown> });
    const body = reply.body ?? { choices: [{ finish_reason: reply.finish ?? 'stop', message: { role: 'assistant', content: reply.content ?? '{}', refusal: reply.refusal ?? null } }] };
    return new Response(JSON.stringify(body), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  });
  return { send: send as unknown as typeof fetch, calls };
}

const schema = z.object({ title: z.string(), hours: z.number().nullable() });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the Kimi writer', () => {
  it('sends the system text and prompt as they are, holds the answer to the schema at low effort, and checks it', async () => {
    const { send, calls } = stubFetch({ content: '{"title":"Assemble two bookshelves","hours":3}' });
    const writer = createKimiWriter({ apiKey: 'nvapi-test', model: DEFAULT_KIMI_MODEL, fetch: send });
    expect(writer.name).toBe('kimi:moonshotai/kimi-k3.1-pro');
    await expect(writer.write({ system: 'Be brief.', prompt: 'two bookshelves', schema, maxTokens: 3_000 })).resolves.toEqual({ title: 'Assemble two bookshelves', hours: 3 });
    const { url, init, body } = calls[0]!;
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer nvapi-test');
    expect(body.messages).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'two bookshelves' },
    ]);
    expect(body).toMatchObject({ model: 'moonshotai/kimi-k3.1-pro', max_tokens: 3_000, reasoning_effort: 'low', stream: false });
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'answer', schema: z.toJSONSchema(schema), strict: true } });
  });

  it('reads a refusal as refused, and a cut-off, non-JSON or misshapen answer or an HTTP error as unavailable', async () => {
    const write = (reply: Parameters<typeof stubFetch>[0]) => createKimiWriter({ apiKey: 'k', model: 'm', fetch: stubFetch(reply).send }).write({ system: '', prompt: '', schema });
    await expect(write({ refusal: 'I can’t help with that.' })).rejects.toBeInstanceOf(AiRefusedError);
    await expect(write({ finish: 'content_filter', content: '' })).rejects.toBeInstanceOf(AiRefusedError);
    await expect(write({ finish: 'length', content: '{"title":"Assem' })).rejects.toThrow('Kimi ran out of room for the answer');
    await expect(write({ content: 'Sure! Here is your task.' })).rejects.toThrow("Kimi's answer wasn't JSON");
    await expect(write({ content: '{"title":4}' })).rejects.toThrow("Kimi's answer didn't fit the expected shape");
    await expect(write({ body: { error: 'nope' } })).rejects.toThrow("Kimi's reply wasn't a chat completion");
    await expect(write({ status: 429, body: { message: 'Too many requests' } })).rejects.toThrow("Kimi didn't answer (HTTP 429)");
    await expect(write({ status: 401 })).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('gives up after its time limit, and on a network error', async () => {
    const hang = (_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)));
    const slow = createKimiWriter({ apiKey: 'k', model: 'm', timeoutMs: 20, fetch: hang as typeof fetch });
    await expect(slow.write({ system: '', prompt: '', schema })).rejects.toThrow("Kimi didn't answer (nothing within 0.02 s)");
    const offline = createKimiWriter({ apiKey: 'k', model: 'm', fetch: (async () => Promise.reject(new TypeError('fetch failed'))) as typeof fetch });
    await expect(offline.write({ system: '', prompt: '', schema })).rejects.toThrow("Kimi didn't answer (network)");
  });

  it('gets exactly what Claude gets: the masked task and the few facts the feature picked', async () => {
    const offer: OfferFacts = {
      helper: { firstName: 'Jordan', headline: 'Furniture assembly', tools: ['Drill'] },
      task: { categorySlug: 'furniture-assembly', title: 'Assemble a standing desk', description: 'Desk with a drawer unit. Call me at [hidden].', details: ['itemType: desk'], dateLabel: 'Sat, Nov 21', remote: false },
      startLabel: '10:00 am',
      brings: ['Drill'],
      notes: '',
      maxLength: 120,
    };
    const message = 'Hi! I can put your desk together at 10:00 am and I will bring my drill.';
    const { send, calls } = stubFetch({ content: JSON.stringify({ message }) });
    const parse = vi.fn(async (_params: Record<string, unknown>) => ({ stop_reason: 'end_turn', parsed_output: { message } }));
    await expect(createAiOfferWriter(createKimiWriter({ apiKey: 'k', model: 'm', fetch: send })).draft(offer)).resolves.toBe(message);
    await expect(createAiOfferWriter(createClaudeWriter({ client: { messages: { parse } } as unknown as ClaudeClient, model: 'm' })).draft(offer)).resolves.toBe(message);
    const claude = parse.mock.calls[0]![0] as { system: string; messages: { content: string }[] };
    expect(calls[0]!.body.messages).toEqual([
      { role: 'system', content: claude.system },
      { role: 'user', content: claude.messages[0]!.content },
    ]);
    expect(claude.messages[0]!.content).toContain('Desk with a drawer unit. Call me at [hidden].');
  });
});

describe('Kimi for this environment', () => {
  it('is set up only with a key: moonshotai/kimi-k3.1-pro on NVIDIA unless KIMI_MODEL and KIMI_BASE_URL say otherwise', async () => {
    expect(kimiWriterFromEnv({})).toBeNull();
    expect(kimiWriterFromEnv({ KIMI_API_KEY: '  ' })).toBeNull();
    expect(kimiWriterFromEnv({ KIMI_API_KEY: 'nvapi-test' })?.name).toBe(`kimi:${DEFAULT_KIMI_MODEL}`);
    expect(kimiWriterFromEnv({ KIMI_API_KEY: 'k', KIMI_MODEL: 'kimi-k3.1-pro' })?.name).toBe('kimi:kimi-k3.1-pro');
    const { send, calls } = stubFetch({ content: '{"title":"Desk","hours":null}' });
    vi.stubGlobal('fetch', send);
    await kimiWriterFromEnv({ KIMI_API_KEY: 'k', KIMI_BASE_URL: 'https://api.example.test/v1/' })!.write({ system: '', prompt: '', schema });
    expect(calls[0]!.url).toBe('https://api.example.test/v1/chat/completions');
  });

  it("stays out of production builds unless KIMI_IN_PRODUCTION=yes, since NVIDIA's free key is for trials only", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(kimiWriterFromEnv({ NODE_ENV: 'production', KIMI_API_KEY: 'k' })).toBeNull();
    expect(kimiWriterFromEnv({ NODE_ENV: 'production', KIMI_API_KEY: 'k', KIMI_IN_PRODUCTION: 'true' })).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('production uses Kimi only with KIMI_IN_PRODUCTION=yes'));
    expect(kimiWriterFromEnv({ NODE_ENV: 'production', KIMI_API_KEY: 'k', KIMI_IN_PRODUCTION: 'yes' })?.name).toBe(`kimi:${DEFAULT_KIMI_MODEL}`);
    expect(kimiWriterFromEnv({ NODE_ENV: 'development', KIMI_API_KEY: 'k' })?.name).toBe(`kimi:${DEFAULT_KIMI_MODEL}`);
  });
});
