/**
 * EXPLAIN (ANALYZE) for the queries behind the hot pages (completion plan 5.7), on the scratch database made by
 * scripts/perf/scratch-db.ts:
 *   npx tsx scripts/perf/explain-hot-queries.ts [--plans]
 * It runs the same functions the pages call (find work, the public board and map, the client home, the booking
 * hub, messages, notifications, the staff queues) as busy people, records every SELECT they send, then explains
 * each one: execution time, and every sequential scan over a table of more than 1,000 rows. `--plans` prints the
 * whole plans too. Local only.
 */
import { createRequire } from 'node:module';
import pg from 'pg';

// The query modules import 'server-only', which throws outside a React Server Components build: stub it.
const require = createRequire(import.meta.url);
const serverOnly = require.resolve('server-only');
require.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as NodeJS.Module;

process.loadEnvFile('.env.local');
const devUrl = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '::1'].includes(devUrl.hostname)) throw new Error('Local only');
const perfUrl = Object.assign(new URL(devUrl), { pathname: '/tasksnearme_perf' }).toString();
process.env.DATABASE_URL = perfUrl;

type Captured = { label: string; text: string; values: unknown[] };
const captured: Captured[] = [];
let label = '';
const originalQuery = pg.Client.prototype.query as (...args: unknown[]) => unknown;
pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
  const [config, values] = args as [string | { text?: string; values?: unknown[] }, unknown];
  const text = typeof config === 'string' ? config : config?.text;
  const params = (typeof config === 'object' && config?.values) || (Array.isArray(values) ? values : []);
  if (label && text && /^\s*(select|with)\b/i.test(text) && !/\b(insert|update|delete)\b/i.test(text)) captured.push({ label, text, values: params as unknown[] });
  return originalQuery.apply(this, args);
} as typeof pg.Client.prototype.query;

async function main() {
  const { db } = await import('../../src/platform/db/client');
  const { getFindWorkPageData } = await import('../../src/modules/offers/helper');
  const { listBoardTasks, listRecentOpenTasks } = await import('../../src/modules/tasks/queries');
  const { getDashboard } = await import('../../src/modules/home/service');
  const { getBookingView, getBookingsPage } = await import('../../src/modules/bookings/hub');
  const { hubDeps } = await import('../../src/modules/bookings/server');
  const { getInbox, getThreadPage } = await import('../../src/modules/messaging/service');
  const { getNotificationsPage } = await import('../../src/modules/notifications/service');
  const { getAdminCases, getAdminHome, parseAdminCaseFilters } = await import('../../src/modules/support/staff');
  const { getAdminVerificationsPage, getVerificationCounts } = await import('../../src/modules/verification/staff');

  const sql = new pg.Client({ connectionString: perfUrl });
  await sql.connect();
  const one = async <T extends pg.QueryResultRow>(text: string) => (await sql.query<T>(text)).rows[0]!;
  const poster = await one<{ id: string; first_name: string }>(`select u.id, u.first_name from users u join bookings b on b.poster_user_id = u.id group by u.id order by count(*) desc limit 1`);
  const helper = await one<{ id: string; first_name: string }>(`select u.id, u.first_name from users u join offers o on o.helper_user_id = u.id join helper_profiles h on h.user_id = u.id group by u.id order by count(*) desc limit 1`);
  const booking = await one<{ id: string }>(`select id from bookings where poster_user_id = '${poster.id}' order by created_at desc limit 1`);
  const thread = await one<{ thread_id: string }>(`select thread_id from thread_participants where user_id = '${poster.id}' limit 1`);
  const staffUser = await one<{ user_id: string }>(`select user_id from staff_roles group by user_id order by count(*) desc limit 1`);
  const staffRoles = (await sql.query<{ role: string }>(`select role from staff_roles where user_id = '${staffUser.user_id}'`)).rows.map((row) => row.role);
  const market = await one<{ id: string }>(`select id from markets limit 1`);
  const now = new Date();
  const staff = { id: staffUser.user_id, roles: staffRoles } as Parameters<typeof getAdminHome>[1];

  const scenarios: [string, () => Promise<unknown>][] = [
    ['find work', () => getFindWorkPageData(db, helper.id, {}, now)],
    ['find work: a category, nearest', () => getFindWorkPageData(db, helper.id, { category: 'furniture-assembly', sort: 'nearest' }, now)],
    ['public board and map', () => listBoardTasks(db, { marketId: market.id, query: { page: 1 } as never, now })],
    ['public category page', () => listRecentOpenTasks(db, { marketId: market.id, categorySlug: 'furniture-assembly', limit: 6, now })],
    ['client home', () => getDashboard(db, { id: poster.id, firstName: poster.first_name, mode: 'poster', timeZone: 'America/New_York' }, {}, now)],
    ['helper home', () => getDashboard(db, { id: helper.id, firstName: helper.first_name, mode: 'helper', timeZone: 'America/New_York' }, {}, now)],
    ['bookings list', () => getBookingsPage(db, poster.id, now)],
    ['booking hub', () => getBookingView(hubDeps(), poster.id, booking.id, now)],
    ['inbox', () => getInbox(db, poster.id, now)],
    ['thread', () => getThreadPage(db, poster.id, thread.thread_id, now)],
    ['notifications', () => getNotificationsPage(db, poster.id, now)],
    ['admin home', () => getAdminHome(db, staff, now)],
    ['admin cases', () => getAdminCases(db, staff, parseAdminCaseFilters({}), now)],
    ['admin verifications', () => getAdminVerificationsPage(db, staff, undefined, now)],
    ['admin verification counts', () => getVerificationCounts(db, now)],
  ];
  for (const [name, run] of scenarios) {
    label = name;
    try {
      await run();
    } catch (error) {
      console.log(`! ${name}: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 6).join(' | ') : String(error)}`);
    }
  }
  label = '';

  const sizes = new Map((await sql.query<{ relname: string; n: string }>(`select relname, n_live_tup::text as n from pg_stat_user_tables`)).rows.map((row) => [row.relname, Number(row.n)]));
  type PlanNode = { 'Node Type': string; 'Relation Name'?: string; 'Actual Rows'?: number; 'Rows Removed by Filter'?: number; Filter?: string; Plans?: PlanNode[] };
  const seqScans = (node: PlanNode, out: string[] = []) => {
    if (node['Node Type'] === 'Seq Scan' && node['Relation Name'] && (sizes.get(node['Relation Name']) ?? 0) > 1000) {
      out.push(`${node['Relation Name']} (${sizes.get(node['Relation Name'])} rows, kept ${node['Actual Rows']}, removed ${node['Rows Removed by Filter'] ?? 0}${node.Filter ? `, filter ${node.Filter.slice(0, 140)}` : ''})`);
    }
    node.Plans?.forEach((child) => seqScans(child, out));
    return out;
  };
  const seen = new Set<string>();
  const results: { label: string; ms: number; scans: string[]; text: string; plan: unknown }[] = [];
  for (const query of captured) {
    const key = `${query.label}|${query.text}|${JSON.stringify(query.values)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [{ 'QUERY PLAN': [plan] }] = (await sql.query(`explain (analyze, buffers, format json) ${query.text}`, query.values)).rows as [{ 'QUERY PLAN': [{ Plan: PlanNode; 'Execution Time': number }] }];
    results.push({ label: query.label, ms: plan['Execution Time'], scans: seqScans(plan.Plan), text: query.text, plan });
  }
  await sql.end();

  // Round trips: the same statement sent many times for one page (a query in a loop).
  const repeats = new Map<string, Map<string, number>>();
  for (const query of captured) {
    const perLabel = repeats.get(query.label) ?? new Map<string, number>();
    const shape = query.text.replace(/\s+/g, ' ').slice(0, 160);
    perLabel.set(shape, (perLabel.get(shape) ?? 0) + 1);
    repeats.set(query.label, perLabel);
  }
  const byLabel = new Map<string, typeof results>();
  for (const result of results) byLabel.set(result.label, [...(byLabel.get(result.label) ?? []), result]);
  for (const [name, list] of byLabel) {
    const total = list.reduce((sum, result) => sum + result.ms, 0);
    console.log(`\n## ${name}: ${list.length} queries, ${total.toFixed(1)} ms in Postgres`);
    for (const [shape, count] of repeats.get(name) ?? []) if (count >= 4) console.log(`  ${count}× ${shape}`);
    for (const result of list.filter((r) => r.scans.length || r.ms > 5).sort((a, b) => b.ms - a.ms)) {
      console.log(`- ${result.ms.toFixed(1)} ms ${result.text.replace(/\s+/g, ' ').slice(0, 220)}`);
      for (const scan of result.scans) console.log(`    seq scan: ${scan}`);
      if (process.argv.includes('--plans')) console.log(JSON.stringify(result.plan, null, 1));
    }
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
