import { describe, expect, it, vi } from 'vitest';

/**
 * The chat window's routes (2026-11-22) without a session: the conversations, a conversation, Help, and a question to
 * the support assistant each refuse before reading or writing anything (the database is a tripwire here), and the
 * question route takes JSON from this site only.
 */

vi.hoisted(() => {
  process.env.FIELD_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
  process.env.BETTER_AUTH_SECRET ||= 'test-secret-for-the-chat-routes';
});

const touched: string[] = [];
const tripwire = new Proxy(
  {},
  {
    get(_target, property) {
      if (property === 'then' || typeof property === 'symbol') return undefined;
      touched.push(String(property));
      throw new Error(`db.${String(property)} touched without a session`);
    },
  },
);

vi.mock('@/platform/db/client', () => ({ db: tripwire }));
vi.mock('@/platform/auth/viewer', () => ({ getViewer: async () => ({ kind: 'anonymous' }) }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'app.example.test' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
}));

const { GET: inbox } = await import('@/app/api/messages/inbox/route');
const { GET: thread } = await import('@/app/api/messages/threads/[threadId]/route');
const { GET: help } = await import('@/app/api/messages/help/route');
const { POST: ask } = await import('@/app/api/assistant/ask/route');

const request = (path: string, init: RequestInit = {}) => new Request(`https://app.example.test${path}`, init);

describe('the chat window routes without a session', () => {
  it('refuse to read the conversations, a conversation or Help', async () => {
    expect((await inbox()).status).toBe(401);
    expect((await thread(request('/api/messages/threads/thr_1'), { params: Promise.resolve({ threadId: 'thr_1' }) })).status).toBe(401);
    expect((await help(request('/api/messages/help?read=1'))).status).toBe(401);
    expect(touched).toEqual([]);
  });

  it('refuse a question, and take JSON from this site only', async () => {
    const json = { 'content-type': 'application/json' };
    const body = JSON.stringify({ chatId: 'ach_0123456789abcdef', question: 'Hi', history: [] });
    expect((await ask(request('/api/assistant/ask', { method: 'POST', headers: { ...json, origin: 'https://evil.example', host: 'app.example.test' }, body }))).status).toBe(403);
    expect((await ask(request('/api/assistant/ask', { method: 'POST', headers: { 'content-type': 'text/plain', host: 'app.example.test' }, body }))).status).toBe(415);
    const signedOut = await ask(request('/api/assistant/ask', { method: 'POST', headers: { ...json, origin: 'https://app.example.test', host: 'app.example.test' }, body }));
    expect(signedOut.status).toBe(401);
    expect(await signedOut.json()).toEqual({ ok: false, code: 'not_allowed' });
    expect(touched).toEqual([]);
  });
});
