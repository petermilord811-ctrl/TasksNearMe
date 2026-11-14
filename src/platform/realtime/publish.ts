import { sql } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { MAX_ENVELOPE_BYTES, type RealtimeEnvelope } from './hub';

/**
 * Sends live notices through Postgres (`pg_notify` on `tnm_realtime`), so every server's listener hears them.
 * Inside a transaction they go out when it commits, and not at all if it rolls back.
 */
export async function publishNotices(db: Pick<Db, 'execute'>, envelopes: readonly RealtimeEnvelope[]): Promise<number> {
  const payloads = envelopes.map((envelope) => JSON.stringify(envelope)).filter((payload) => payload.length <= MAX_ENVELOPE_BYTES);
  if (payloads.length === 0) return 0;
  for (let i = 0; i < payloads.length; i += 100) {
    const chunk = payloads.slice(i, i + 100);
    await db.execute(sql`select pg_notify('tnm_realtime', v.payload) from (values ${sql.join(chunk.map((payload) => sql`(${payload})`), sql`, `)}) as v(payload)`);
  }
  return payloads.length;
}
