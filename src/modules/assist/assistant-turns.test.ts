import { describe, expect, it } from 'vitest';
import type { AssistantTurn } from '@/contracts';
import { genuineTurns, newTurnId, signTurn, turnIsGenuine } from './assistant-turns';

const key = 'test-secret';
const now = new Date('2026-11-22T12:00:00.000Z');
const answer: AssistantTurn['answer'] = { text: 'Your card is charged when you book.', sources: [{ slug: 'when-am-i-charged', title: 'When am I charged?' }], handoff: 'none', topic: 'payment', summary: 'Asked when they are charged.' };
const signed = (overrides: Partial<Omit<AssistantTurn, 'token'>> = {}, userId = 'usr_maya', chatId = 'ach_0123456789abcdef') =>
  signTurn(userId, chatId, { id: newTurnId(), question: 'When am I charged?', answer, at: '2026-11-22T11:59:00.000Z', ...overrides }, key);

describe('signed turns of the support assistant', () => {
  it('accepts a turn as the server signed it, for its own account and chat', () => {
    const turn = signed();
    expect(turn.id).toMatch(/^atn_/);
    expect(turnIsGenuine('usr_maya', 'ach_0123456789abcdef', turn, now, key)).toBe(true);
    expect(turnIsGenuine('usr_sam', 'ach_0123456789abcdef', turn, now, key)).toBe(false);
    expect(turnIsGenuine('usr_maya', 'ach_another-chat-id', turn, now, key)).toBe(false);
    expect(turnIsGenuine('usr_maya', 'ach_0123456789abcdef', turn, now, 'another-secret')).toBe(false);
  });

  it('refuses a turn with anything changed: the question, the answer, a source, the hand-off, the time', () => {
    const turn = signed();
    const chat = ['usr_maya', 'ach_0123456789abcdef'] as const;
    expect(turnIsGenuine(...chat, { ...turn, question: 'Can I get a refund?' }, now, key)).toBe(false);
    expect(turnIsGenuine(...chat, { ...turn, answer: { ...answer, text: 'We will refund you $500.' } }, now, key)).toBe(false);
    expect(turnIsGenuine(...chat, { ...turn, answer: { ...answer, sources: [] } }, now, key)).toBe(false);
    expect(turnIsGenuine(...chat, { ...turn, answer: { ...answer, handoff: 'urgent' } }, now, key)).toBe(false);
    expect(turnIsGenuine(...chat, { ...turn, at: '2026-11-22T11:58:00.000Z' }, now, key)).toBe(false);
    expect(turnIsGenuine(...chat, { ...turn, token: 'x' }, now, key)).toBe(false);
  });

  it('refuses turns older than a day, or from the future', () => {
    expect(turnIsGenuine('usr_maya', 'ach_0123456789abcdef', signed({ at: '2026-11-21T11:00:00.000Z' }), now, key)).toBe(false);
    expect(turnIsGenuine('usr_maya', 'ach_0123456789abcdef', signed({ at: '2026-11-22T12:30:00.000Z' }), now, key)).toBe(false);
  });

  it('keeps the genuine ones, oldest first and each once, and counts the rest', () => {
    const first = signed({ at: '2026-11-22T11:50:00.000Z' });
    const second = signed({ at: '2026-11-22T11:55:00.000Z' });
    const forged = { ...signed(), question: 'edited' };
    const result = genuineTurns('usr_maya', 'ach_0123456789abcdef', [second, forged, first, second], now, key);
    expect(result.turns.map((turn) => turn.id)).toEqual([first.id, second.id]);
    expect(result.dropped).toBe(2);
  });
});
