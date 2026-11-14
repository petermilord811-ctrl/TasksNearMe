import { and, eq, like } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '@/platform/db/connect';

/**
 * The webhook inbox (completion plan 5.11) against the database: events recorded once, duplicates acknowledged
 * without running again, bad signatures not recorded, failures retried on their backoff with the payload signed
 * again, and dead after the last try until staff dismiss them. The providers' handlers are replaced by a stand-in
 * whose answer each test sets; the inbox, its signing and its storage are real.
 */

type Outcome = { status: number; body: Record<string, unknown> } | null;
const handler = vi.hoisted(() => ({ next: 'ok' as 'ok' | 'ignored' | 'bad' | 'throw' | 'off', calls: [] as { headers: Record<string, string | null> }[] }));
vi.mock('@/modules/webhooks/dispatch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/webhooks/dispatch')>();
  return {
    ...actual,
    dispatchWebhook: async (_provider: string, _db: unknown, _payload: string, headers: Record<string, string | null>): Promise<Outcome> => {
      handler.calls.push({ headers });
      if (handler.next === 'throw') throw new Error('Database unreachable');
      if (handler.next === 'off') return null;
      if (handler.next === 'bad') return { status: 401, body: { ok: false } };
      return { status: 200, body: { ok: true, ...(handler.next === 'ignored' ? { ignored: true } : {}) } };
    },
  };
});

const { dismissWebhook, receiveWebhook, retryDueWebhooks, RETRY_DELAYS_MS } = await import('@/modules/webhooks/inbox');
const { webhookEvents } = await import('@/modules/webhooks/schema');
const { actOnWebhook, getAdminWebhooks } = await import('@/modules/webhooks/staff');
const { auditLog } = await import('@/platform/audit/schema');

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from('inbox-test-secret').toString('base64')}`;
const now = new Date('2031-03-03T12:00:00.000Z');
const later = (ms: number) => new Date(now.getTime() + ms);
const payload = (id: string) => JSON.stringify({ type: 'email.bounced', data: { email_id: id } });
const headers = (id: string) => ({ 'svix-id': id, 'svix-timestamp': '0', 'svix-signature': 'v1,given' });
const rowOf = async (id: string) => (await db.select().from(webhookEvents).where(and(eq(webhookEvents.provider, 'resend'), eq(webhookEvents.eventId, id))))[0];

beforeEach(() => {
  handler.next = 'ok';
  handler.calls = [];
});

afterAll(async () => {
  await db.delete(auditLog).where(and(eq(auditLog.targetType, 'webhook_event'), like(auditLog.actorId, 'usr\\_%')));
  await db.delete(webhookEvents).where(like(webhookEvents.eventId, 'msg\\_inbox\\_%'));
  await pool.end();
});

describe('the webhook inbox', () => {
  it('records a processed event once and acknowledges a redelivery without running it again', async () => {
    expect(await receiveWebhook(db, 'resend', payload('a'), headers('msg_inbox_a'), now)).toEqual({ status: 200, body: { ok: true } });
    expect(await rowOf('msg_inbox_a')).toMatchObject({ status: 'processed', attempts: 1, payload: null, type: 'email.bounced' });
    expect(await receiveWebhook(db, 'resend', payload('a'), headers('msg_inbox_a'), now)).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect(handler.calls).toHaveLength(1);
  });

  it('keeps ignored events apart, and records nothing for a bad signature or an endpoint that is off', async () => {
    handler.next = 'ignored';
    await receiveWebhook(db, 'resend', payload('b'), headers('msg_inbox_b'), now);
    expect(await rowOf('msg_inbox_b')).toMatchObject({ status: 'ignored' });
    handler.next = 'bad';
    expect(await receiveWebhook(db, 'resend', payload('c'), headers('msg_inbox_c'), now)).toEqual({ status: 401, body: { ok: false } });
    handler.next = 'off';
    expect(await receiveWebhook(db, 'resend', payload('d'), headers('msg_inbox_d'), now)).toBeNull();
    expect(await rowOf('msg_inbox_c')).toBeUndefined();
    expect(await rowOf('msg_inbox_d')).toBeUndefined();
  });

  it('keeps a failure with its payload, answers 500, and retries it on its backoff, signed again', async () => {
    handler.next = 'throw';
    expect(await receiveWebhook(db, 'resend', payload('e'), headers('msg_inbox_e'), now)).toEqual({ status: 500, body: { ok: false } });
    expect(await rowOf('msg_inbox_e')).toMatchObject({ status: 'failed', attempts: 1, payload: payload('e'), lastError: 'Error: Database unreachable', nextAttemptAt: later(RETRY_DELAYS_MS[0]) });

    handler.next = 'ok';
    await retryDueWebhooks(db, later(RETRY_DELAYS_MS[0] - 1000));
    expect(handler.calls).toHaveLength(1);
    await retryDueWebhooks(db, later(RETRY_DELAYS_MS[0]));
    expect(await rowOf('msg_inbox_e')).toMatchObject({ status: 'processed', attempts: 2, payload: null, lastError: null });
    // The retry carried our own fresh signature, not the stored delivery's.
    expect(handler.calls[1]!.headers['svix-signature']).toMatch(/^v1,[A-Za-z0-9+/]+=*$/);
    expect(handler.calls[1]!.headers['svix-id']).toBe('msg_inbox_e');
  });

  it('is dead after the last try, until staff dismiss it', async () => {
    handler.next = 'throw';
    await receiveWebhook(db, 'resend', payload('f'), headers('msg_inbox_f'), now);
    let at = now;
    for (const delay of RETRY_DELAYS_MS) {
      at = new Date(at.getTime() + delay);
      await retryDueWebhooks(db, at);
    }
    const dead = await rowOf('msg_inbox_f');
    expect(dead).toMatchObject({ status: 'dead', attempts: RETRY_DELAYS_MS.length + 1, nextAttemptAt: null, payload: payload('f') });
    // Nothing retries a dead event.
    await retryDueWebhooks(db, new Date(at.getTime() + 365 * 86_400_000));
    expect((await rowOf('msg_inbox_f'))!.attempts).toBe(RETRY_DELAYS_MS.length + 1);

    expect(await dismissWebhook(db, dead!.id, at)).toBe(true);
    expect(await rowOf('msg_inbox_f')).toMatchObject({ status: 'ignored', payload: null });
    expect(await dismissWebhook(db, dead!.id, at)).toBe(false);
  });

  it('lists dead events for admins and finance, who replay or dismiss them (audited)', async () => {
    handler.next = 'throw';
    await receiveWebhook(db, 'resend', payload('g'), headers('msg_inbox_g'), now);
    await db.update(webhookEvents).set({ status: 'dead', nextAttemptAt: null }).where(eq(webhookEvents.eventId, 'msg_inbox_g'));
    const page = await getAdminWebhooks(db, now);
    const row = page.failing.find((item) => item.eventId === 'msg_inbox_g')!;
    expect(row).toMatchObject({ provider: 'resend', status: 'dead', canReplay: true, lastError: 'Error: Database unreachable' });

    expect(await actOnWebhook(db, { id: 'usr_alex', roles: ['support_agent'] }, { eventRowId: row.id, action: 'replay' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    // Replayed while the cause is still there: it stays failing, with the error.
    expect(await actOnWebhook(db, { id: 'usr_casey', roles: ['finance'] }, { eventRowId: row.id, action: 'replay' }, now)).toEqual({ ok: false, code: 'unknown' });
    handler.next = 'ok';
    expect(await actOnWebhook(db, { id: 'usr_riley', roles: ['admin'] }, { eventRowId: row.id, action: 'replay' }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await rowOf('msg_inbox_g')).toMatchObject({ status: 'processed', payload: null });
    expect(await actOnWebhook(db, { id: 'usr_riley', roles: ['admin'] }, { eventRowId: row.id, action: 'dismiss' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    const audit = await db.select().from(auditLog).where(and(eq(auditLog.targetType, 'webhook_event'), eq(auditLog.targetId, row.id)));
    expect(audit.map((item) => [item.action, item.actorId]).sort()).toEqual([['webhook.replayed', 'usr_casey'], ['webhook.replayed', 'usr_riley']]);
  });
});
