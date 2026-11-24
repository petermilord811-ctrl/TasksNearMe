import { sql } from 'drizzle-orm';
import { NEIGHBORS_ANSWERS_SHOWN, type NeighborsAnswersView } from '@/contracts';
import { areas, markets } from '@/modules/markets/schema';
import type { Db } from '@/platform/db/connect';
import { GENERATED_ID_PATTERN, type RowScope } from '@/shared/sample-data';
import { answerExcerpt } from './domain';
import { communityPosts, communityReactions, communityReplies } from './schema';

/**
 * "Helped 12 neighbors on Neighbors" and the helper's most-marked answers (2026-11-24), for their profile and its peek:
 * their visible replies on visible posts (never a thanks post nor one of their own) that someone else marked Helpful.
 * The count is distinct posts. `rows: 'real'` (the public where samples are hidden) counts real posts, replies and
 * marks only. Credit on the profile, nothing more: no reward, Spark or ranking reads it (blueprint principle 6).
 */
export async function neighborsAnswersOf(db: Db, helperUserId: string, rows: RowScope = 'all'): Promise<NeighborsAnswersView | null> {
  const real = rows === 'real' ? sql`and r.id ~ ${GENERATED_ID_PATTERN} and p.id ~ ${GENERATED_ID_PATTERN} and x.user_id ~ ${GENERATED_ID_PATTERN}` : sql``;
  const found = await db.execute<{ id: string; post_id: string; body: string; title: string; place: string; helpful: number }>(sql`
    select r.id, r.post_id, r.body, p.title, coalesce(a.name, m.name) as place, count(distinct x.user_id)::int as helpful
      from ${communityReplies} r
      join ${communityPosts} p on p.id = r.post_id
      join ${markets} m on m.id = p.market_id
      left join ${areas} a on a.id = p.area_id
      join ${communityReactions} x on x.target_kind = 'reply' and x.target_id = r.id and x.kind = 'helpful' and x.user_id <> r.author_user_id
      where r.author_user_id = ${helperUserId} and r.status = 'visible' and p.status = 'visible' and p.kind <> 'thanks'
        and p.author_user_id <> ${helperUserId} ${real}
      group by r.id, p.id, a.name, m.name
      order by helpful desc, r.created_at desc`);
  const posts = new Set<string>();
  const answers: NeighborsAnswersView['answers'] = [];
  for (const row of found.rows) {
    // One answer a question: their best there.
    if (posts.has(row.post_id)) continue;
    posts.add(row.post_id);
    if (answers.length < NEIGHBORS_ANSWERS_SHOWN) answers.push({ id: row.id, questionTitle: row.title, excerpt: answerExcerpt(row.body), placeName: row.place, helpfulCount: Number(row.helpful) });
  }
  return posts.size > 0 ? { helpedCount: posts.size, answers } : null;
}
