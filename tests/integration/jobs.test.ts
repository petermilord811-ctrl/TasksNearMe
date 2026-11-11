import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { runDueJobs, type Job } from '@/modules/jobs/runner';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
afterAll(() => pool.end());

describe('the job runner', () => {
  it('runs the due work: an offer past its expiry is expired without anyone looking', async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_lee'));
    await db.insert(tasks).values({ ...desk!, id: 'tsk_job', slug: 'job-desk', status: 'open', offerCount: 1, version: 1 });
    await db.insert(offers).values({ ...offer!, id: 'off_job', taskId: 'tsk_job', status: 'pending', revision: 1, expiresAt: new Date(Date.now() - 60_000) });

    expect(await runDueJobs(db, new Date())).toEqual({ ran: true, failed: [] });
    const [after] = await db.select({ status: offers.status }).from(offers).where(eq(offers.id, 'off_job'));
    expect(after?.status).toBe('expired');
  });

  it('lets one instance run at a time, and keeps going when a job fails', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const slow: Job = { name: 'slow', run: () => held };
    const first = runDueJobs(db, new Date(), [slow]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await runDueJobs(db, new Date(), [])).toEqual({ ran: false, failed: [] });
    release();
    expect(await first).toEqual({ ran: true, failed: [] });

    const failing: Job = {
      name: 'broken',
      run: () => {
        throw new Error('boom');
      },
    };
    const ok: Job = { name: 'fine', run: async () => undefined };
    expect(await runDueJobs(db, new Date(), [failing, ok])).toEqual({ ran: true, failed: ['broken'] });
  });
});
