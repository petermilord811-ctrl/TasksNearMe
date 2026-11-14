import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { webhookActionInputSchema, WEBHOOK_PROVIDER_IDS, type ActionResult, type AdminWebhookRow, type AdminWebhooksPageData, type StaffRole, type WebhookActionInput, type WebhookProviderId } from '@/contracts';
import type { StaffActor } from '@/modules/support/staff';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { signAgain } from './dispatch';
import { dismissWebhook, replayWebhook } from './inbox';
import { webhookEvents } from './schema';

/**
 * `/admin/webhooks` (completion plan 5.11): admins and finance see the webhook inbox's failures and replay or
 * dismiss them. Both are audited.
 */

const READERS: readonly StaffRole[] = ['admin', 'finance'];
export const canSeeWebhooks = (roles: readonly StaffRole[]) => roles.some((role) => READERS.includes(role));

const DAY = 86_400_000;

export async function getAdminWebhooks(db: Db, now: Date): Promise<AdminWebhooksPageData> {
  const [failing, counts] = await Promise.all([
    db
      .select()
      .from(webhookEvents)
      .where(inArray(webhookEvents.status, ['failed', 'dead']))
      .orderBy(sql`case when ${webhookEvents.status} = 'dead' then 0 else 1 end`, asc(webhookEvents.receivedAt))
      .limit(100),
    db
      .select({ provider: webhookEvents.provider, status: webhookEvents.status, count: sql<number>`count(*)::int` })
      .from(webhookEvents)
      .where(gte(webhookEvents.receivedAt, new Date(now.getTime() - DAY)))
      .groupBy(webhookEvents.provider, webhookEvents.status),
  ]);
  const countOf = (provider: string, status: string) => counts.find((row) => row.provider === provider && row.status === status)?.count ?? 0;
  return {
    failing: failing.map(
      (row): AdminWebhookRow => ({
        id: row.id,
        provider: row.provider as WebhookProviderId,
        eventId: row.eventId,
        type: row.type,
        status: row.status as AdminWebhookRow['status'],
        attempts: row.attempts,
        ...(row.lastError ? { lastError: row.lastError } : {}),
        receivedAt: row.receivedAt.toISOString(),
        ...(row.nextAttemptAt ? { nextAttemptAt: row.nextAttemptAt.toISOString() } : {}),
        canReplay: !!row.payload && signAgain(row.provider as WebhookProviderId, row.payload, row.eventId, now) !== null,
      }),
    ),
    last24h: WEBHOOK_PROVIDER_IDS.map((provider) => ({
      provider,
      processed: countOf(provider, 'processed'),
      ignored: countOf(provider, 'ignored'),
      failed: countOf(provider, 'failed'),
      dead: countOf(provider, 'dead'),
    })),
    canAct: true,
  };
}

export async function actOnWebhook(db: Db, staff: StaffActor, input: WebhookActionInput, now: Date): Promise<ActionResult> {
  const parsed = webhookActionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!canSeeWebhooks(staff.roles)) return { ok: false, code: 'not_allowed' };
  const [row] = await db.select().from(webhookEvents).where(and(eq(webhookEvents.id, parsed.data.eventRowId), inArray(webhookEvents.status, ['failed', 'dead']))).limit(1);
  if (!row) return { ok: false, code: 'not_allowed' };
  const audit = (action: string) =>
    db.insert(auditLog).values({
      id: newId('aud'),
      at: now.toISOString(),
      actorId: staff.id,
      actorRole: staff.roles[0] ?? 'staff',
      action,
      targetType: 'webhook_event',
      targetId: row.id,
      metadata: { provider: row.provider, eventId: row.eventId, type: row.type, status: row.status, attempts: row.attempts },
    });
  if (parsed.data.action === 'dismiss') {
    if (!(await dismissWebhook(db, row.id, now))) return { ok: false, code: 'not_allowed' };
    await audit('webhook.dismissed');
    return { ok: true, code: 'updated' };
  }
  await audit('webhook.replayed');
  return (await replayWebhook(db, row, now)) ? { ok: true, code: 'updated' } : { ok: false, code: 'unknown' };
}
