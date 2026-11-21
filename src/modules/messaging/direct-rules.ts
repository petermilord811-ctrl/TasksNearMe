import { DIRECT_FIRST_MESSAGES_MAX, type DirectChatRefusal, type DirectMessageSetting } from '@/contracts';

/**
 * Direct conversations' rules as pure functions (owner, 2026-11-21; decisions.md): who may start one, the daily
 * allowance, and the first messages before an answer.
 */

/** The `linked_id` of two people's direct conversation: the same whoever starts it, so there's only ever one. */
export function directPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export interface DirectChatFacts {
  self: boolean;
  /** The viewer's account may start conversations (active, not restricted or suspended). */
  viewerActive: boolean;
  /** The recipient's account is active (not deleted, banned or suspended). */
  recipientActive: boolean;
  blocked: boolean;
  setting: DirectMessageSetting;
  /** The two have talked about a task before (an offer, invite, booking or regular visits conversation). */
  taskContacts: boolean;
  /** Direct conversations the viewer started in the last 24 hours, and how many they may. */
  startedLastDay: number;
  perDay: number;
}

/** Why the viewer can't start a new direct conversation with the recipient, or null when they can. */
export function directChatRefusal(facts: DirectChatFacts): DirectChatRefusal | null {
  if (facts.self) return 'self';
  if (!facts.viewerActive) return 'account_limited';
  if (!facts.recipientActive) return 'unavailable';
  if (facts.blocked) return 'blocked';
  if (facts.setting === 'nobody') return 'not_accepting';
  if (facts.setting === 'task_contacts' && !facts.taskContacts) return 'task_contacts_only';
  if (facts.startedLastDay >= facts.perDay) return 'limit_reached';
  return null;
}

/**
 * Messages the starter can still send before the other person answers: null once they have (or for the person who
 * didn't start it), else what's left of `DIRECT_FIRST_MESSAGES_MAX`.
 */
export function firstMessagesLeft(input: { viewerStarted: boolean; viewerSent: number; otherSent: number }): number | null {
  if (!input.viewerStarted || input.otherSent > 0) return null;
  return Math.max(0, DIRECT_FIRST_MESSAGES_MAX - input.viewerSent);
}

/** When the oldest of the last day's starts drops out of the 24-hour window (the next one frees up then). */
export function allowanceResetsAt(startsLastDay: readonly Date[], now: Date): Date | undefined {
  if (startsLastDay.length === 0) return undefined;
  const oldest = Math.min(...startsLastDay.map((at) => at.getTime()));
  return new Date(Math.max(oldest + 86_400_000, now.getTime()));
}
