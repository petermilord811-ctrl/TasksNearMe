import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createGeminiWriter, DEFAULT_GEMINI_MODELS, geminiRetryAfterMs, geminiWritersFromEnv, untilPacificMidnight, type HttpPost } from './gemini';
import { AiRateLimitedError, AiRefusedError, AiUnavailableError } from './writer';

const schema = z.object({ title: z.string(), hours: z.number().nullable() });

/** A transport that answers with `status` and `body` (JSON, or the text given), recording each request. */
function stubPost(status: number, body: unknown) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown>; timeoutMs: number }[] = [];
  const post: HttpPost = vi.fn(async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown>, timeoutMs: init.timeoutMs });
    return { status, text: typeof body === 'string' ? body : JSON.stringify(body) };
  });
  return { post, calls };
}

const answer = (text: string, finishReason = 'STOP', extraParts: { text: string; thought?: boolean }[] = []) => ({
  candidates: [{ finishReason, content: { role: 'model', parts: [...extraParts, { text }] } }],
});

describe('the Gemini writer', () => {
  it('sends the system text and prompt to generateContent with the JSON schema, and checks the answer', async () => {
    const { post, calls } = stubPost(200, answer('{"title":"Assemble two bookshelves","hours":3}', 'STOP', [{ text: 'thinking it over', thought: true }]));
    const writer = createGeminiWriter({ apiKey: 'AQ.test', model: 'gemini-3.5-flash-lite', post, timeoutMs: 5_000 });
    expect(writer.name).toBe('gemini:gemini-3.5-flash-lite');
    await expect(writer.write({ system: 'Be brief.', prompt: 'two bookshelves', schema, maxTokens: 1_200 })).resolves.toEqual({ title: 'Assemble two bookshelves', hours: 3 });
    const { url, headers, body, timeoutMs } = calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(headers['x-goog-api-key']).toBe('AQ.test');
    expect(timeoutMs).toBe(5_000);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Be brief.' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'two bookshelves' }] }]);
    const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
    expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', responseJsonSchema: jsonSchema, maxOutputTokens: 1_200 });
  });

  it('reads its safety stops as refusals, and a cut-off, early stop, non-JSON or misshapen answer or an HTTP error as unavailable', async () => {
    const write = (status: number, body: unknown) => createGeminiWriter({ apiKey: 'k', model: 'm', post: stubPost(status, body).post }).write({ system: '', prompt: '', schema });
    await expect(write(200, { promptFeedback: { blockReason: 'SAFETY' } })).rejects.toBeInstanceOf(AiRefusedError);
    await expect(write(200, answer('', 'PROHIBITED_CONTENT'))).rejects.toThrow('Gemini declined the request');
    await expect(write(200, answer('{"title":"Assem', 'MAX_TOKENS'))).rejects.toThrow('Gemini ran out of room for the answer');
    await expect(write(200, answer('{}', 'RECITATION'))).rejects.toThrow('Gemini stopped early (RECITATION)');
    await expect(write(200, answer('Sure! Here it is.'))).rejects.toThrow("Gemini's answer wasn't JSON");
    await expect(write(200, answer('{"title":4}'))).rejects.toThrow("Gemini's answer didn't fit the expected shape");
    await expect(write(200, { candidates: [] })).rejects.toThrow('Gemini gave no answer');
    await expect(write(200, '<!DOCTYPE html><title>Error 403</title>')).rejects.toThrow("Gemini didn't answer (not JSON)");
    await expect(write(503, { error: { code: 503, message: 'This model is currently experiencing high demand.' } })).rejects.toThrow("Gemini didn't answer (HTTP 503)");
    await expect(write(404, { error: { code: 404 } })).rejects.not.toBeInstanceOf(AiRateLimitedError);
  });

  it('reads a 429 as its free limit: until midnight Pacific for the daily allowance, else the delay it gives', async () => {
    const now = Date.parse('2026-11-21T18:30:00Z'); // 10:30 am in Los Angeles (PST)
    const daily = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '38s' }] } };
    const minute = { error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '38.2s' }] } };
    const write = (body: unknown) => createGeminiWriter({ apiKey: 'k', model: 'm', post: stubPost(429, body).post, now: () => now }).write({ system: '', prompt: '', schema });
    await expect(write(daily)).rejects.toMatchObject({ name: 'AiRateLimitedError', message: 'Gemini is at its free limit (HTTP 429)', retryAfterMs: 13.5 * 3_600_000 + 60_000 });
    await expect(write(minute)).rejects.toMatchObject({ retryAfterMs: 38_200 });
    await expect(write({ error: { code: 429 } })).rejects.toMatchObject({ retryAfterMs: undefined });
    expect(geminiRetryAfterMs('not json', now)).toBeUndefined();
    // Midnight to midnight: a full day, plus the minute's margin.
    expect(untilPacificMidnight(Date.parse('2026-11-21T08:00:00Z'))).toBe(24 * 3_600_000 + 60_000);
  });

  it('gives up after its time limit, and on a network error', async () => {
    const timeout = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    const slow = createGeminiWriter({ apiKey: 'k', model: 'm', timeoutMs: 20, post: async () => Promise.reject(timeout) });
    await expect(slow.write({ system: '', prompt: '', schema })).rejects.toThrow("Gemini didn't answer (nothing within 0.02 s)");
    const offline = createGeminiWriter({ apiKey: 'k', model: 'm', post: async () => Promise.reject(new Error('connect ENETUNREACH')) });
    await expect(offline.write({ system: '', prompt: '', schema })).rejects.toThrow("Gemini didn't answer (network)");
    await expect(offline.write({ system: '', prompt: '', schema })).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe('Gemini for this environment', () => {
  it('is set up only with a key: Flash Lite, then 3 Flash Preview, each its own free allowance, unless GEMINI_MODEL says otherwise', () => {
    expect(geminiWritersFromEnv({})).toEqual([]);
    expect(geminiWritersFromEnv({ GEMINI_API_KEY: ' ' })).toEqual([]);
    expect(geminiWritersFromEnv({ GEMINI_API_KEY: 'k' }).map((writer) => writer.name)).toEqual(DEFAULT_GEMINI_MODELS.map((model) => `gemini:${model}`));
    expect(geminiWritersFromEnv({ GEMINI_API_KEY: 'k', GEMINI_MODEL: '', GEMINI_BASE_URL: '', GEMINI_TIMEOUT_SECONDS: '' })).toHaveLength(2);
    expect(geminiWritersFromEnv({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-3.8-flash, gemini-flash-lite-latest' }).map((writer) => writer.name)).toEqual(['gemini:gemini-3.8-flash', 'gemini:gemini-flash-lite-latest']);
    expect(geminiWritersFromEnv({ NODE_ENV: 'production', GEMINI_API_KEY: 'k' })).toHaveLength(2);
  });
});
