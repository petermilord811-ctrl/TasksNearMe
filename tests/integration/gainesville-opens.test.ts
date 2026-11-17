import fs from 'node:fs';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { markets } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { emitVerificationEvent } from '@/modules/verification/state';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { GENERATED_ID_PATTERN } from '@/shared/sample-data';

/**
 * Migration 0063 (owner, 2026-11-17: Gainesville, FL is the first city) opens Gainesville and closes Austin in SQL,
 * doing what setMarketStatus does: its data statements run here again, inside a transaction that rolls back, against
 * the state they met in production (Gainesville paused, Austin open, a helper waiting with a 326 ZIP). The outbox row
 * it writes by hand must match what emitVerificationEvent writes, or the city_open notice would break silently.
 */
const [, OPENING, CLOSING] = fs.readFileSync('db/migrations/0063_gainesville_opens.sql', 'utf8').split('--> statement-breakpoint').map((part) => part.trim());
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
afterAll(() => pool.end());

class RollBack extends Error {}

it('opens Gainesville with the waiting helpers brought in and told, closes Austin, and audits both', async () => {
  await db
    .transaction(async (tx) => {
      await tx.update(markets).set({ status: 'paused' }).where(eq(markets.id, 'mkt_gainesville'));
      await tx.update(markets).set({ status: 'prelaunch' }).where(eq(markets.id, 'mkt_austin'));
      // Lee waits for their city with a Gainesville ZIP (moved there for this test only).
      await tx.update(helperProfiles).set({ areaId: null, homeZip: '32601', homeCity: 'Gainesville', homeState: 'FL' }).where(eq(helperProfiles.userId, 'usr_lee'));
      // The migration already ran once when the test database was made: only the rows written here count.
      const audited = () =>
        tx
          .select({ id: auditLog.id, targetId: auditLog.targetId, actorRole: auditLog.actorRole, metadata: auditLog.metadata })
          .from(auditLog)
          .where(and(eq(auditLog.action, 'config.market_status'), sql`${auditLog.metadata}->>'by' = 'migration 0063'`));
      const earlier = new Set((await audited()).map((row) => row.id));
      const writtenHere = async () => (await audited()).filter((row) => !earlier.has(row.id));

      await tx.execute(sql.raw(OPENING!));
      await tx.execute(sql.raw(CLOSING!));

      const statuses = await tx.select({ id: markets.id, status: markets.status }).from(markets).where(inArray(markets.id, ['mkt_gainesville', 'mkt_austin']));
      expect(Object.fromEntries(statuses.map((row) => [row.id, row.status]))).toEqual({ mkt_gainesville: 'prelaunch', mkt_austin: 'paused' });
      const [lee] = await tx.select({ homeMarketId: users.homeMarketId }).from(users).where(eq(users.id, 'usr_lee'));
      expect(lee!.homeMarketId).toBe('mkt_gainesville');

      // The hand-written notice, next to the one emitVerificationEvent writes for the same outcome.
      await emitVerificationEvent(tx, 'usr_jordan', 'helper', 'city_open', { city: 'Gainesville' });
      const notices = await tx
        .select()
        .from(outboxEvents)
        .where(and(inArray(outboxEvents.aggregateId, ['usr_lee', 'usr_jordan']), sql`${outboxEvents.payload}->>'outcome' = 'city_open'`));
      const fromMigration = notices.find((row) => row.aggregateId === 'usr_lee')!;
      const fromApp = notices.find((row) => row.aggregateId === 'usr_jordan')!;
      const shape = (row: typeof fromMigration) => ({ type: row.type, aggregateType: row.aggregateType, payload: { ...row.payload, userId: '…' }, keys: Object.keys(row.payload).sort() });
      expect(shape(fromMigration)).toEqual(shape(fromApp));
      expect(fromMigration.payload.userId).toBe('usr_lee');
      expect(fromMigration.id).toMatch(new RegExp(GENERATED_ID_PATTERN));

      const audits = await writtenHere();
      expect(audits).toHaveLength(2);
      expect(audits.find((row) => row.targetId === 'mkt_gainesville')).toMatchObject({ actorRole: 'system', metadata: { from: 'paused', to: 'prelaunch', helpersBroughtIn: 1 } });
      expect(audits.find((row) => row.targetId === 'mkt_austin')).toMatchObject({ actorRole: 'system', metadata: { from: 'prelaunch', to: 'paused' } });

      // Run again: nothing changes and nothing more is written.
      await tx.execute(sql.raw(OPENING!));
      await tx.execute(sql.raw(CLOSING!));
      expect(await writtenHere()).toHaveLength(2);
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });
});
