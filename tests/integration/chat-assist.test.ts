import { and, eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { usernames, users } from '@/modules/accounts/schema';
import { CATCH_UP_RULE, TRANSLATE_MANY_RULE, catchUp, translateMessages } from '@/modules/messaging/assist';
import { startDirectChat } from '@/modules/messaging/direct';
import { messages, threadParticipants, threads } from '@/modules/messaging/schema';
import { getThreadPage, sendMessage } from '@/modules/messaging/service';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';
import { createDb } from '@/platform/db/connect';
import type { BatchTranslator } from '@/integrations/ai/translator';
import type { ConversationSummarizer, ConversationSummaryInput } from '@/integrations/ai/conversation-summarizer';

/**
 * "Translate this conversation" and "Catch me up" (2026-11-24, owner: "implement others all one by one"): only the viewer's
 * own conversations, only as they see them (contact details masked, also in what a model reads), the other person's words
 * only, nothing in the viewer's language sent, and each with its allowance. Never a real model: recording stand-ins. Its
 * own people (usr_tmp_ca_*), cleaned up after.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const ANA = 'usr_tmp_ca_ana';
const BEN = 'usr_tmp_ca_ben';
const CAL = 'usr_tmp_ca_cal';
const PEOPLE = [ANA, BEN, CAL];
const now = new Date();
const later = (ms: number) => new Date(now.getTime() + ms);
let key = 0;
const requestKey = () => `00000000-0000-4000-8000-${String(++key).padStart(12, '0')}`;
let thread = '';
let other = '';
/** Ana's messages to Ben, oldest first: in Spanish with her number, in English, a thumbs-up, then nine unread ones. */
const ids: Record<string, string> = {};

/** Writes as `from` at `at`, straight into the conversation (no first-message limits): its id. */
async function wrote(threadId: string, name: string, from: string, body: string, at: Date): Promise<string> {
  const id = `msg_tmp_ca_${name}`;
  await db.insert(messages).values({ id, threadId, senderUserId: from, kind: 'text', body, createdAt: at });
  ids[name] = id;
  return id;
}

function translatorRecording() {
  const asked: { id: string; body: string }[][] = [];
  const translator: BatchTranslator = {
    name: 'test',
    translateMany: async (input) => {
      asked.push(input.items);
      return Object.fromEntries(input.items.map((item) => [item.id, `[${input.to}] ${item.body}`]));
    },
  };
  return { translator, asked };
}

function summarizerRecording() {
  const asked: ConversationSummaryInput[] = [];
  const summarizer: ConversationSummarizer = {
    name: 'test',
    summarize: async (input) => {
      asked.push(input);
      return [`${input.them} wrote ${input.lines.length} lines (${input.locale}).`];
    },
  };
  return { summarizer, asked };
}

/** The allowance's current window, used up. */
async function useUp(key: string, rule: { limit: number; windowSeconds: number }, at: Date) {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(at.getTime() / windowMs) * windowMs);
  await db.insert(rateLimits).values({ key, windowStart, count: rule.limit }).onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: rule.limit } });
}

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values([
    { ...maya!, id: ANA, email: 'tmp-ca-ana@example.test', name: 'Ana A.', firstName: 'Ana', lastName: 'Avila', phone: '+15125550791', directMessages: 'everyone', locale: 'es' },
    { ...maya!, id: BEN, email: 'tmp-ca-ben@example.test', name: 'Ben B.', firstName: 'Ben', lastName: 'Brook', phone: '+15125550792', directMessages: 'everyone', locale: 'en' },
    { ...maya!, id: CAL, email: 'tmp-ca-cal@example.test', name: 'Cal C.', firstName: 'Cal', lastName: 'Cruz', phone: '+15125550793', directMessages: 'everyone', locale: 'en' },
  ]);
  await db.insert(usernames).values([{ userId: ANA, username: 'tmpca_ana' }, { userId: BEN, username: 'tmpca_ben' }, { userId: CAL, username: 'tmpca_cal' }]);
  // Ana writes first; Ben answers (a real conversation, nothing masked away from Ana's view of her own words).
  const started = await startDirectChat(db, ANA, { to: BEN, body: 'Hola Ben, ¿puedes ayudarme el sábado?', requestKey: requestKey() }, now);
  expect(started).toMatchObject({ ok: true, code: 'sent' });
  thread = started.ok && started.redirectTo ? started.redirectTo.split('/').pop()! : '';
  expect(thread).toMatch(/^thr_/);
  expect(await sendMessage(db, BEN, thread, { body: 'Hi Ana! Sure, what do you need?', attachmentIds: [] }, later(1_000))).toMatchObject({ ok: true });
  await wrote(thread, 'phone', ANA, 'Mi número es 512-555-0177, llámame el sábado.', later(2_000));
  await wrote(thread, 'english', ANA, 'Perfect, see you then!', later(3_000));
  await wrote(thread, 'thumbs', ANA, '👍', later(4_000));
  await wrote(thread, 'mine', BEN, 'Great, I will bring the dolly.', later(5_000));
  // Another conversation (Cal and Ben) with a message of its own.
  const elsewhere = await startDirectChat(db, CAL, { to: BEN, body: 'Hola Ben, soy Cal.', requestKey: requestKey() }, now);
  other = elsewhere.ok && elsewhere.redirectTo ? elsewhere.redirectTo.split('/').pop()! : '';
  expect(other).toMatch(/^thr_/);
  await wrote(other, 'elsewhere', CAL, 'Otro mensaje en otra conversación.', later(6_000));
});

afterAll(async () => {
  const mine = await db.select({ id: threads.id }).from(threads).where(or(inArray(threads.startedByUserId, PEOPLE), like(threads.linkedId, '%usr_tmp_ca_%')));
  const threadIds = mine.map((row) => row.id);
  if (threadIds.length) {
    await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, threadIds));
    await db.delete(messages).where(inArray(messages.threadId, threadIds));
    await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, threadIds));
    await db.delete(threads).where(inArray(threads.id, threadIds));
  }
  await db.delete(rateLimits).where(or(...PEOPLE.map((id) => like(rateLimits.key, `%${id}%`))));
  await db.delete(usernames).where(inArray(usernames.userId, PEOPLE));
  await db.delete(users).where(inArray(users.id, PEOPLE));
  await pool.end();
});

describe('Translate this conversation', () => {
  it('sends only the other person’s words the reader can’t read, masked as they see them, and answers by message', async () => {
    const { translator, asked } = translatorRecording();
    const all = [ids.phone!, ids.english!, ids.thumbs!, ids.mine!, ids.elsewhere!, 'msg_nobody'];
    const answer = await translateMessages(db, BEN, thread, all, later(10_000), translator);
    // One request, for the Spanish message only, and Ana's number never reached it.
    expect(asked).toHaveLength(1);
    expect(asked[0]!.map((item) => item.id)).toEqual([ids.phone]);
    expect(asked[0]![0]!.body).toBe('Mi número es [hidden], llámame el sábado.');
    expect(answer).toEqual({ texts: { [ids.phone!]: '[en] Mi número es [hidden], llámame el sábado.' }, same: expect.arrayContaining([ids.english, ids.thumbs]) });
    // Ben's own message, another conversation's and one that doesn't exist are in neither.
    expect(answer!.same).toHaveLength(2);

    // Ana reads Spanish: Ben's English words are translated for her, her own never.
    const forAna = translatorRecording();
    const hers = await translateMessages(db, ANA, thread, [ids.mine!, ids.phone!], later(10_000), forAna.translator);
    expect(forAna.asked[0]!.map((item) => item.id)).toEqual([ids.mine]);
    expect(hers?.texts[ids.mine!]).toBe('[es] Great, I will bring the dolly.');
  });

  it('refuses a conversation that isn’t the viewer’s, and asks for nothing', async () => {
    const { translator, asked } = translatorRecording();
    expect(await translateMessages(db, CAL, thread, [ids.phone!], later(10_000), translator)).toBeNull();
    expect(await translateMessages(db, BEN, 'thr_nobody', [ids.phone!], later(10_000), translator)).toBeNull();
    expect(asked).toHaveLength(0);
  });

  it('stops at the day’s allowance; what’s already in the reader’s language needs none', async () => {
    const at = later(20_000);
    await useUp(`messages:translate-many:${BEN}`, TRANSLATE_MANY_RULE, at);
    const { translator, asked } = translatorRecording();
    expect(await translateMessages(db, BEN, thread, [ids.phone!], at, translator)).toBeNull();
    expect(asked).toHaveLength(0);
    expect(await translateMessages(db, BEN, thread, [ids.english!, ids.thumbs!], at, translator)).toEqual({ texts: {}, same: expect.arrayContaining([ids.english, ids.thumbs]) });
  });
});

describe('Catch me up', () => {
  it('offers itself on opening with eight or more unread, and summarizes the unread part as the reader sees it', async () => {
    // Nine more from Ana while Ben was away (one with her email).
    const base = 60_000;
    const unread: string[] = [];
    for (let index = 0; index < 9; index += 1) {
      unread.push(await wrote(thread, `unread_${index}`, ANA, index === 4 ? 'Escríbeme a ana.avila@example.com si es más fácil.' : `Mensaje ${index}: ¿te viene bien a las 10?`, later(base + index * 1_000)));
    }
    await db.update(threadParticipants).set({ lastReadAt: later(base - 1_000) }).where(and(eq(threadParticipants.threadId, thread), eq(threadParticipants.userId, BEN)));
    const page = await getThreadPage(db, BEN, thread, later(base + 20_000));
    expect(page?.firstUnreadId).toBe(unread[0]);
    expect(page?.catchUp).toEqual({ unread: 9 });
    expect(page?.assist).toMatchObject({ summarize: true, translate: true, language: 'en' });
    // Read now: the next opening offers nothing.
    expect((await getThreadPage(db, BEN, thread, later(base + 21_000)))?.catchUp).toBeUndefined();

    const { summarizer, asked } = summarizerRecording();
    const summary = await catchUp(db, BEN, thread, { fromId: unread[0]! }, later(base + 22_000), summarizer);
    expect(summary).toEqual({ points: ['Ana wrote 9 lines (en).'], count: 9, from: later(base).toISOString(), to: later(base + 8_000).toISOString() });
    expect(asked[0]!.lines.every((line) => line.from === 'them')).toBe(true);
    expect(asked[0]!.lines.map((line) => line.text).join(' ')).not.toContain('ana.avila@example.com');
    expect(asked[0]!.lines[4]!.text).toBe('Escríbeme a [hidden] si es más fácil.');
    expect(asked[0]).toMatchObject({ me: 'Ben', them: 'Ana', locale: 'en' });

    // Nothing unread (or another conversation's message): the latest written messages, both people's.
    const latest = await catchUp(db, BEN, thread, { fromId: ids.elsewhere! }, later(base + 23_000), summarizer);
    expect(latest?.count).toBe(15);
    expect(asked[1]!.lines.some((line) => line.from === 'me')).toBe(true);
    // In Spanish for Ana.
    await catchUp(db, ANA, thread, {}, later(base + 24_000), summarizer);
    expect(asked[2]).toMatchObject({ me: 'Ana', them: 'Ben', locale: 'es' });
  });

  it('refuses a conversation that isn’t the viewer’s, and stops at the hour’s allowance', async () => {
    const { summarizer, asked } = summarizerRecording();
    expect(await catchUp(db, CAL, thread, {}, later(90_000), summarizer)).toBeNull();
    const at = later(95_000);
    await useUp(`messages:catch-up:${BEN}`, CATCH_UP_RULE, at);
    expect(await catchUp(db, BEN, thread, {}, at, summarizer)).toBeNull();
    expect(asked).toHaveLength(0);
  });
});
