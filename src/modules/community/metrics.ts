import { sql } from 'drizzle-orm';
import type { MetricsCommunity } from '@/contracts';
import { bookings } from '@/modules/bookings/schema';
import { areas } from '@/modules/markets/schema';
import type { Db } from '@/platform/db/connect';
import { realRowsOnly as realOnly, samplesHiddenInThisBuild } from '@/shared/sample-data';
import { UNANSWERED_KINDS } from './domain';
import { reportCounts } from './moderation';
import { communityPosts, communityReplies } from './schema';

/**
 * How Neighbors is doing over a period (plan 10.22), for `/admin/metrics`: posts and replies, where posts come from,
 * how fast asks get answered, how often a recommendation request names a helper, how many asks became tasks and
 * bookings, and reports. Real rows only, so the demo marketplace never inflates them; every market.
 */
export async function communityMetrics(db: Db, from: Date, to: Date, hideSamples: boolean = samplesHiddenInThisBuild()): Promise<MetricsCommunity> {
  // Real rows only where samples are hidden (production); in development and the e2e build every row is seed data.
  const realRowsOnly = (column: Parameters<typeof realOnly>[0]) => (hideSamples ? realOnly(column) : sql`true`);
  const inPeriod = sql`${communityPosts.createdAt} >= ${from} and ${communityPosts.createdAt} <= ${to}`;
  const real = realRowsOnly(communityPosts.id);
  const askKinds = sql.join(UNANSWERED_KINDS.map((kind) => sql`${kind}`), sql`, `);
  const [totals, byArea, answers, named, asked, reports] = await Promise.all([
    db.execute<{ posts: number; replies: number }>(sql`select
        (select count(*)::int from ${communityPosts} where ${inPeriod} and ${real} and ${communityPosts.status} <> 'removed') as posts,
        (select count(*)::int from ${communityReplies} r where r.created_at >= ${from} and r.created_at <= ${to} and ${realRowsOnly(sql`r.id`)} and r.status <> 'removed') as replies`),
    db.execute<{ area_name: string | null; n: number }>(sql`select ${areas.name} as area_name, count(*)::int as n
        from ${communityPosts} left join ${areas} on ${areas.id} = ${communityPosts.areaId}
        where ${inPeriod} and ${real} and ${communityPosts.status} <> 'removed'
        group by ${areas.name} order by n desc limit 8`),
    // Each ask's first answer from someone other than its author.
    db.execute<{ asks: number; within_day: number; median_minutes: number | null }>(sql`select
        count(*)::int as asks,
        count(*) filter (where first_at is not null and first_at - created_at <= interval '24 hours')::int as within_day,
        (percentile_cont(0.5) within group (order by extract(epoch from first_at - created_at) / 60) filter (where first_at is not null))::float as median_minutes
      from (
        select p.created_at, (select min(r.created_at) from ${communityReplies} r where r.post_id = p.id and r.author_user_id <> p.author_user_id and r.status = 'visible') as first_at
        from ${communityPosts} p
        where p.created_at >= ${from} and p.created_at <= ${to} and ${realRowsOnly(sql`p.id`)} and p.status <> 'removed' and p.kind in (${askKinds})
      ) asked`),
    db.execute<{ requests: number; named: number }>(sql`select
        count(*)::int as requests,
        count(*) filter (where exists (select 1 from ${communityReplies} r where r.post_id = p.id and r.recommended_helper_user_id is not null and r.status = 'visible'))::int as named
      from ${communityPosts} p
      where p.created_at >= ${from} and p.created_at <= ${to} and ${realRowsOnly(sql`p.id`)} and p.status <> 'removed' and p.kind = 'recommendation'`),
    db.execute<{ asked: number; booked: number }>(sql`select
        count(*)::int as asked,
        count(*) filter (where exists (select 1 from ${bookings} b where b.task_id = p.task_id))::int as booked
      from ${communityPosts} p
      where p.created_at >= ${from} and p.created_at <= ${to} and ${realRowsOnly(sql`p.id`)} and p.task_id is not null and p.kind in (${askKinds})`),
    reportCounts(db, from, to),
  ]);
  const median = answers.rows[0]?.median_minutes;
  return {
    posts: Number(totals.rows[0]?.posts ?? 0),
    replies: Number(totals.rows[0]?.replies ?? 0),
    postsByArea: byArea.rows.map((row) => ({ ...(row.area_name ? { areaName: row.area_name } : {}), count: Number(row.n) })),
    asks: Number(answers.rows[0]?.asks ?? 0),
    answeredWithinDay: Number(answers.rows[0]?.within_day ?? 0),
    ...(median !== null && median !== undefined ? { medianFirstReplyMinutes: Math.round(Number(median)) } : {}),
    recommendationRequests: Number(named.rows[0]?.requests ?? 0),
    withNamedHelper: Number(named.rows[0]?.named ?? 0),
    askedForHelp: Number(asked.rows[0]?.asked ?? 0),
    booked: Number(asked.rows[0]?.booked ?? 0),
    reports: reports.reports,
    autoHidden: reports.autoHidden,
  };
}
