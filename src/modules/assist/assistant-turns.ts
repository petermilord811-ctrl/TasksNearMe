import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ASSISTANT_TURN_TTL_HOURS, type AssistantAnswer, type AssistantTurn } from '@/contracts';
import { appSecret } from '@/platform/crypto/app-secret';

/**
 * Signed turns of the support assistant's chat (2026-11-22). The chat lives in the browser until the person asks for a
 * person, so nothing is stored for people who only ask the assistant. Each answer comes back with a signature (HMAC
 * with the app secret) over the account, the chat, the turn's id and time, the question and the whole answer. A turn
 * that comes back as context, or in a hand-off, counts only with a signature that matches and within a day: the
 * transcript support receives is the one the assistant wrote, never an edited copy.
 */

const SIGNATURE = /^[A-Za-z0-9_-]{43}$/;
const TTL_MS = ASSISTANT_TURN_TTL_HOURS * 60 * 60 * 1000;

const digest = (text: string) => createHash('sha256').update(text).digest('base64url');

/** The answer as one string, field by field in a fixed order, so the same answer always signs the same way. */
function answerText(answer: AssistantAnswer): string {
  return [answer.text, answer.sources.map((source) => `${source.slug}\u0001${source.title}`).join('\u0002'), answer.handoff, answer.topic, answer.summary].join('\u0000');
}

function signature(userId: string, chatId: string, turn: Omit<AssistantTurn, 'token'>, key: string): string {
  return createHmac('sha256', key)
    .update(`assistant-turn:${userId}:${chatId}:${turn.id}:${turn.at}:${digest(turn.question)}:${digest(answerText(turn.answer))}`)
    .digest('base64url');
}

export function newTurnId(): string {
  return `atn_${randomBytes(12).toString('base64url')}`;
}

export function signTurn(userId: string, chatId: string, turn: Omit<AssistantTurn, 'token'>, key = appSecret()): AssistantTurn {
  return { ...turn, token: signature(userId, chatId, turn, key) };
}

/** Whether a turn is this account's and this chat's, unchanged, and recent (constant-time comparison). */
export function turnIsGenuine(userId: string, chatId: string, turn: AssistantTurn, now: Date, key = appSecret()): boolean {
  if (!SIGNATURE.test(turn.token)) return false;
  const at = Date.parse(turn.at);
  if (!Number.isFinite(at) || at > now.getTime() + 60_000 || now.getTime() - at > TTL_MS) return false;
  const expected = Buffer.from(signature(userId, chatId, turn, key));
  const given = Buffer.from(turn.token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The genuine turns, oldest first, each once; the rest are dropped (and counted). */
export function genuineTurns(userId: string, chatId: string, turns: readonly AssistantTurn[], now: Date, key = appSecret()): { turns: AssistantTurn[]; dropped: number } {
  const seen = new Set<string>();
  const kept = turns.filter((turn) => {
    if (seen.has(turn.id) || !turnIsGenuine(userId, chatId, turn, now, key)) return false;
    seen.add(turn.id);
    return true;
  });
  kept.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { turns: kept, dropped: turns.length - kept.length };
}
