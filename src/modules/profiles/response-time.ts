import { eq, sql } from 'drizzle-orm';
import { RESPONSE_TIME_MIN_SAMPLES, RESPONSE_TIME_WINDOW_DAYS } from '@/shared/response-time';
import type { Db } from '@/platform/db/connect';
import { helperProfiles } from './schema';

/**
 * A helper's usual response time (completion plan 7.12): over the conversations they were in during the last 30
 * days, the median time from the other person's first message to the helper's first answer after it. Stored on
 * the profile (shown as a range: within an hour, a few hours, a day) once there are at least three; fewer leave
 * what's there.
 */
export async function recomputeResponseTime(db: Db, helperUserId: string, now: Date): Promise<number | null> {
  const since = new Date(now.getTime() - RESPONSE_TIME_WINDOW_DAYS * 86_400_000);
  const result = await db.execute<{ median: number | null; samples: number }>(sql`
    with firsts as (
      select m.thread_id, min(m.created_at) as asked_at
        from messages m
        join thread_participants tp on tp.thread_id = m.thread_id and tp.user_id = ${helperUserId}
       where m.kind = 'text' and m.sender_user_id is not null and m.sender_user_id <> ${helperUserId} and m.created_at >= ${since}
       group by m.thread_id
    ), answered as (
      select f.asked_at,
             (select min(r.created_at) from messages r where r.thread_id = f.thread_id and r.sender_user_id = ${helperUserId} and r.created_at > f.asked_at) as answered_at
        from firsts f
    )
    select percentile_cont(0.5) within group (order by extract(epoch from (answered_at - asked_at)) / 60) as median, count(*)::int as samples
      from answered
     where answered_at is not null`);
  const row = result.rows[0];
  if (!row || Number(row.samples) < RESPONSE_TIME_MIN_SAMPLES || row.median === null) return null;
  const minutes = Math.max(1, Math.round(Number(row.median)));
  await db.update(helperProfiles).set({ responseTimeMinutes: minutes }).where(eq(helperProfiles.userId, helperUserId));
  return minutes;
}
