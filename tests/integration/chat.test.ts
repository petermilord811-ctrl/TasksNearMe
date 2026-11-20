import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { messageReactions, messages, savedReplies } from '@/modules/messaging/schema';
import { deleteReply, getThreadPage, offerThreadId, reactToMessage, saveReply, sendMessage } from '@/modules/messaging/service';
import { createDb } from '@/platform/db/connect';
import { consumeRateLimit } from '@/platform/rate-limit';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * A professional chat (completion plan 7.3) on Ruth's laptop task and Lee's offer: quote-replies (same thread only,
 * masked like the original), reactions (the two people only), and saved replies (up to 20, one's own).
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
afterAll(() => pool.end());
const now = () => new Date();

describe('chat', () => {
  it('quotes a message of the same conversation, masked for the other person as the original is', async () => {
    const thread = (await offerThreadId(db, 'off_lee_computer', now()))!;
    expect(await sendMessage(db, 'usr_ruth', thread, { body: `Call me at 512-555-0188 (${Date.now()})`, attachmentIds: [] }, now())).toMatchObject({ ok: true });
    const page = (await getThreadPage(db, 'usr_lee', thread, now()))!;
    const ruths = [...page.messages].reverse().find((message) => message.sender === 'them' && message.kind === 'text')!;
    expect(await sendMessage(db, 'usr_lee', thread, { body: 'Will do', attachmentIds: [], replyToId: ruths.id }, now())).toMatchObject({ ok: true });
    expect(await sendMessage(db, 'usr_lee', thread, { body: 'Nope', attachmentIds: [], replyToId: 'msg_not_here' }, now())).toMatchObject({ ok: false, fieldErrors: { replyToId: ['invalid'] } });
    const forLee = (await getThreadPage(db, 'usr_lee', thread, now()))!;
    const reply = [...forLee.messages].reverse().find((message) => message.sender === 'me' && message.kind === 'text')!;
    expect(reply.replyTo).toMatchObject({ id: ruths.id, sender: 'them' });
    // Before a booking, Lee sees Ruth's number masked in the quote too.
    expect(JSON.stringify(reply.replyTo!.segments)).not.toContain('512-555-0188');
  });

  it('lets the two people react, once per emoji, and nobody else', async () => {
    const thread = (await offerThreadId(db, 'off_lee_computer', now()))!;
    const page = (await getThreadPage(db, 'usr_ruth', thread, now()))!;
    const target = page.messages.find((message) => message.kind === 'text')!;
    expect(await reactToMessage(db, 'usr_ruth', thread, { messageId: target.id, emoji: 'thumbs_up', on: true }, now())).toMatchObject({ ok: true });
    expect(await reactToMessage(db, 'usr_ruth', thread, { messageId: target.id, emoji: 'thumbs_up', on: true }, now())).toMatchObject({ ok: true });
    expect(await reactToMessage(db, 'usr_maya', thread, { messageId: target.id, emoji: 'heart', on: true }, now())).toMatchObject({ ok: false });
    const rows = await db.select().from(messageReactions).where(eq(messageReactions.messageId, target.id));
    expect(rows.filter((row) => row.emoji === 'thumbs_up')).toHaveLength(1);
    const forLee = (await getThreadPage(db, 'usr_lee', thread, now()))!;
    expect(forLee.messages.find((message) => message.id === target.id)?.reactions).toEqual([{ emoji: 'thumbs_up', count: 1, mine: false }]);
    await reactToMessage(db, 'usr_ruth', thread, { messageId: target.id, emoji: 'thumbs_up', on: false }, now());
    expect(await db.select().from(messageReactions).where(and(eq(messageReactions.messageId, target.id), eq(messageReactions.userId, 'usr_ruth')))).toHaveLength(0);
  });

  it('takes reactions at a person’s pace, and none once the conversation closed (security review SEC21)', async () => {
    const thread = (await offerThreadId(db, 'off_lee_computer', now()))!;
    const page = (await getThreadPage(db, 'usr_ruth', thread, now()))!;
    const target = page.messages.find((message) => message.kind === 'text')!;
    // One instant for all of it, so the minute can't turn over halfway.
    const at = now();
    await db.delete(rateLimits).where(eq(rateLimits.key, 'message-reactions:usr_ruth'));
    for (let i = 0; i < 60; i += 1) await consumeRateLimit(db, 'message-reactions:usr_ruth', { limit: 60, windowSeconds: 60 }, at);
    expect(await reactToMessage(db, 'usr_ruth', thread, { messageId: target.id, emoji: 'heart', on: true }, at)).toMatchObject({ ok: false, code: 'rate_limited' });
    await db.delete(rateLimits).where(eq(rateLimits.key, 'message-reactions:usr_ruth'));
    // A year on, the task has long ended unbooked: its offer conversation is closed.
    const later = new Date(at.getTime() + 365 * 24 * 3_600_000);
    expect(await reactToMessage(db, 'usr_ruth', thread, { messageId: target.id, emoji: 'heart', on: true }, later)).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('keeps saved replies per person, up to twenty, and lists them in the conversation', async () => {
    await db.delete(savedReplies).where(eq(savedReplies.userId, 'usr_lee'));
    expect(await saveReply(db, 'usr_lee', { title: 'On my way', body: 'Hi {first_name}, on my way for {task}.' }, now())).toMatchObject({ ok: true, code: 'saved' });
    const thread = (await offerThreadId(db, 'off_lee_computer', now()))!;
    const page = (await getThreadPage(db, 'usr_lee', thread, now()))!;
    expect(page.savedReplies).toEqual([expect.objectContaining({ title: 'On my way', body: 'Hi {first_name}, on my way for {task}.' })]);
    expect((await getThreadPage(db, 'usr_ruth', thread, now()))?.savedReplies).toBeUndefined();
    for (let i = 1; i < 20; i += 1) await saveReply(db, 'usr_lee', { title: `Reply ${i}`, body: 'Thanks!' }, now());
    expect(await saveReply(db, 'usr_lee', { title: 'One too many', body: 'Thanks!' }, now())).toMatchObject({ ok: false, code: 'limit_reached' });
    expect(await deleteReply(db, 'usr_ruth', page.savedReplies![0]!.id)).toMatchObject({ ok: false });
    expect(await deleteReply(db, 'usr_lee', page.savedReplies![0]!.id)).toMatchObject({ ok: true });
    await db.delete(savedReplies).where(eq(savedReplies.userId, 'usr_lee'));
    await db.delete(messages).where(eq(messages.body, 'Will do'));
  });
});
