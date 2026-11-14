import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { dispatchWebhook, eventIdentity, signAgain, type WebhookHeaders, type WebhookOutcome, type WebhookProvider } from './dispatch';
import { webhookEvents } from './schema';

/**
 * The webhook inbox (blueprint 09 §4.2; completion plan 5.11).
 * - A delivery runs through `receiveWebhook`: an event already processed is acknowledged without running again;
 *   a bad signature (4xx) isn't recorded; success is recorded as processed (or ignored); a failure keeps the
 *   payload, answers 500 (so the provider retries too) and is retried by the jobs runner with backoff.
 * - After the last try the event is `dead`: staff see it on /admin/webhooks and replay or dismiss it.
 * Retries and replays sign the stored payload again with our own secrets (`signAgain`), so they pass the same
 * checks as a delivery and the handlers stay as they are.
 */

/** Retries after a failure: 5 minutes, 30 minutes, 2 hours, 12 hours; then the event is dead. */
export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000] as const;
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const RETRY_BATCH = 20;

const hashOf = (payload: string) => createHash('sha256').update(payload).digest('hex');
const errorText = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 500);

type Row = typeof webhookEvents.$inferSelect;

/** Records an attempt's result on the event's row (creating it on the first attempt). */
async function record(
  db: Db,
  input: { provider: WebhookProvider; eventId: string; type: string; payload: string; previous?: Row },
  result: { ok: true; ignored: boolean } | { ok: false; error: unknown },
  now: Date,
): Promise<void> {
  const attempts = (input.previous?.attempts ?? 0) + 1;
  const values = result.ok
    ? { status: result.ignored ? 'ignored' : 'processed', payload: null, lastError: null, processedAt: now, nextAttemptAt: null }
    : attempts >= MAX_ATTEMPTS
      ? { status: 'dead', payload: input.payload, lastError: errorText(result.error), nextAttemptAt: null }
      : { status: 'failed', payload: input.payload, lastError: errorText(result.error), nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[attempts - 1]!) };
  await db
    .insert(webhookEvents)
    .values({ id: newId('whk'), provider: input.provider, eventId: input.eventId, type: input.type, payloadHash: hashOf(input.payload), attempts, receivedAt: now, updatedAt: now, ...values })
    .onConflictDoUpdate({ target: [webhookEvents.provider, webhookEvents.eventId], set: { attempts, updatedAt: now, ...values } });
}

/** Runs one attempt and records it. A thrown error becomes a 500 (the provider retries too). */
async function attempt(
  db: Db,
  input: { provider: WebhookProvider; eventId: string; type: string; payload: string; headers: WebhookHeaders; previous?: Row },
  now: Date,
): Promise<WebhookOutcome | null> {
  let outcome: WebhookOutcome | null;
  try {
    outcome = await dispatchWebhook(input.provider, db, input.payload, input.headers, now);
  } catch (error) {
    console.error(`[webhooks] ${input.provider} ${input.type} ${input.eventId} failed`, error);
    await record(db, input, { ok: false, error }, now);
    return { status: 500, body: { ok: false } };
  }
  // Off (404) or a bad signature (4xx): nothing to record.
  if (outcome === null || (outcome.status >= 400 && outcome.status < 500)) return outcome;
  await record(db, input, { ok: true, ignored: outcome.body.ignored === true }, now);
  return outcome;
}

/** A delivery from a provider. `null`: the endpoint is off (the route answers 404). */
export async function receiveWebhook(db: Db, provider: WebhookProvider, payload: string, headers: WebhookHeaders, now: Date): Promise<WebhookOutcome | null> {
  const identity = eventIdentity(provider, payload, headers);
  // Not an event we can name (unreadable, or unsigned Resend): the handler answers it, nothing is recorded.
  if (!identity) return dispatchWebhook(provider, db, payload, headers, now);
  const [previous] = await db.select().from(webhookEvents).where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, identity.eventId))).limit(1);
  if (previous && (previous.status === 'processed' || previous.status === 'ignored')) return { status: 200, body: { ok: true, duplicate: true } };
  return attempt(db, { provider, ...identity, payload, headers, ...(previous ? { previous } : {}) }, now);
}

/** Runs a stored event again, signed with our own secrets. False when it can't be (keys missing, no payload). */
export async function replayWebhook(db: Db, row: Row, now: Date): Promise<boolean> {
  if (!row.payload) return false;
  const provider = row.provider as WebhookProvider;
  const headers = signAgain(provider, row.payload, row.eventId, now);
  if (!headers) return false;
  const outcome = await attempt(db, { provider, eventId: row.eventId, type: row.type, payload: row.payload, headers, previous: row }, now);
  return outcome !== null && outcome.status < 400;
}

/** The jobs runner's `webhooks.retry`: failed events whose next try is due, oldest first. */
export async function retryDueWebhooks(db: Db, now: Date): Promise<number> {
  const due = await db
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.status, 'failed'), lte(webhookEvents.nextAttemptAt, now)))
    .orderBy(asc(webhookEvents.nextAttemptAt))
    .limit(RETRY_BATCH);
  let succeeded = 0;
  for (const row of due) if (await replayWebhook(db, row, now)) succeeded += 1;
  return succeeded;
}

/** Staff decided a dead (or failed) event needs nothing more: it leaves the list, its payload is dropped. */
export async function dismissWebhook(db: Db, rowId: string, now: Date): Promise<boolean> {
  const updated = await db
    .update(webhookEvents)
    .set({ status: 'ignored', payload: null, nextAttemptAt: null, updatedAt: now })
    .where(and(eq(webhookEvents.id, rowId), inArray(webhookEvents.status, ['failed', 'dead'])))
    .returning({ id: webhookEvents.id });
  return updated.length > 0;
}
