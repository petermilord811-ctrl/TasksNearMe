import pg from 'pg';

/**
 * Multiplies the seed into realistic volume for EXPLAIN (completion plan 5.7), on the scratch database only.
 *
 * Every table except the reference data is copied `copies` times. In a copy, ids and every column that points at
 * another copied row (`id`, `*_id`, foreign keys, unique text columns) get a `_c<n>` suffix, so copy n is a
 * consistent world of its own. Columns that point at reference data (markets, areas, categories, policies) keep
 * their value, so all copies share Austin and its categories. Times move by up to ±30 days and map points by up to
 * about 10 km, per row, so the copies don't sit on top of each other. Then threads with messages are made for
 * every offer and booking (the seed has none), and every person gets 60 notifications.
 */

/** Reference data: one market, its areas and categories, policies, flags, agreements; staff stay as seeded. */
const REFERENCE_TABLES = new Set(['markets', 'areas', 'categories', 'market_categories', 'market_policies', 'feature_flags', 'agreements', 'spatial_ref_sys', 'staff_roles', 'staff_authenticators', 'staff_session_checks', '__drizzle_migrations']);
/** Columns that name reference data without a foreign key. */
const REFERENCE_COLUMNS = new Set(['market_id', 'home_market_id', 'category_id', 'area_id', 'public_area_id', 'policy_version_id', 'market_policy_id', 'agreement_id', 'category_slug', 'market_slug']);
const TEXT_TYPES = new Set(['text', 'varchar', 'citext', 'bpchar']);

type Column = { name: string; udt: string; skip: boolean };

export async function multiply(url: string, copies: number): Promise<Record<string, number>> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const q = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await client.query<T>(sql, params)).rows;
  try {
    // Foreign keys and triggers off while copying (superuser on the local server).
    await q('set session_replication_role = replica');
    const tables = (await q<{ name: string }>(`select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).map((row) => row.name);
    const counts = new Map<string, number>();
    for (const table of tables) counts.set(table, Number((await q<{ count: string }>(`select count(*) from "${table}"`))[0]!.count));
    const cloned = tables.filter((table) => !REFERENCE_TABLES.has(table) && (counts.get(table) ?? 0) > 0);

    const foreignKeys = await q<{ table: string; column: string; target: string }>(`
      select c.conrelid::regclass::text as table, a.attname as column, c.confrelid::regclass::text as target
        from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace`);
    const uniqueIndexes = await q<{ table: string; definition: string }>(`
      select t.relname as table, pg_get_indexdef(i.indexrelid) as definition
        from pg_index i join pg_class t on t.oid = i.indrelid join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public' and i.indisunique`);

    for (const table of cloned) await q(`create temp table "orig_${table}" as table "${table}"`);
    if (copies > 0) {
      for (const table of cloned) {
        const columns = (await q<{ name: string; udt: string; identity: string; generated: string }>(
          `select column_name as name, udt_name as udt, is_identity as identity, is_generated as generated from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`,
          [table],
        )).map((column): Column => ({ name: column.name, udt: column.udt, skip: column.identity === 'YES' || column.generated === 'ALWAYS' }));
        // A unique index stays unique in a copy when one of its columns is a suffixed id; only the others (an email,
        // a slug, a handle) need the suffix themselves. Only the column list counts, not a partial index's WHERE.
        const indexColumns = uniqueIndexes.filter((index) => index.table === table).map((index) => {
          const list = index.definition.replace(/^.*? USING \w+ /, '').replace(/ WHERE .*$/, '');
          return columns.filter((column) => new RegExp(`\\b${column.name}\\b`).test(list)).map((column) => column.name);
        });
        const expressions = columns.filter((column) => !column.skip).map((column) => {
          const name = `"${column.name}"`;
          const seed = `o.ctid::text || ':' || n || ':${column.name}'`;
          if (TEXT_TYPES.has(column.udt)) {
            const foreignKey = foreignKeys.find((key) => key.table === table && key.column === column.name);
            const pointsAtReference = foreignKey ? REFERENCE_TABLES.has(foreignKey.target) : REFERENCE_COLUMNS.has(column.name);
            const idLike = column.name === 'id' || column.name.endsWith('_id') || Boolean(foreignKey);
            const suffixed = (other: string) => {
              const key = foreignKeys.find((entry) => entry.table === table && entry.column === other);
              return (other === 'id' || other.endsWith('_id') || Boolean(key)) && !(key ? REFERENCE_TABLES.has(key.target) : REFERENCE_COLUMNS.has(other));
            };
            const needsSuffixForUniqueness = indexColumns.some((list) => list.includes(column.name) && !list.some(suffixed));
            if (!pointsAtReference && (idLike || needsSuffixForUniqueness)) return `o.${name} || '_c' || n`;
            return `o.${name}`;
          }
          if (column.udt === 'timestamptz' || column.udt === 'timestamp') return `o.${name} + make_interval(mins => (hashtext(${seed}) % 43200))`;
          if (column.udt === 'float8' && /_(lat|latitude)$/.test(column.name)) return `o.${name} + (hashtext(${seed}) % 900) / 10000.0`;
          if (column.udt === 'float8' && /_(lng|lon|longitude)$/.test(column.name)) return `o.${name} + (hashtext(${seed}) % 900) / 10000.0`;
          return `o.${name}`;
        });
        const names = columns.filter((column) => !column.skip).map((column) => `"${column.name}"`);
        await q(`insert into "${table}" (${names.join(', ')}) select ${expressions.join(', ')} from "orig_${table}" o cross join generate_series(1, ${copies}) as n`);
      }
    }

    // Threads for offers (4 messages) and bookings (12), alternating between the two people.
    await q(`
      insert into threads (id, kind, linked_id, task_id, created_at, last_message_at)
      select 'thr_o_' || o.id, 'offer', o.id, o.task_id, o.created_at, o.created_at + interval '3 hours' from offers o
      on conflict do nothing`);
    await q(`
      insert into threads (id, kind, linked_id, task_id, created_at, last_message_at)
      select 'thr_b_' || b.id, 'booking', b.id, b.task_id, b.created_at, b.created_at + interval '2 days' from bookings b
      on conflict do nothing`);
    await q(`
      insert into thread_participants (thread_id, user_id, last_read_at)
      select 'thr_o_' || o.id, person, o.created_at + interval '1 hour'
        from offers o join tasks t on t.id = o.task_id, unnest(array[o.helper_user_id, t.poster_user_id]) as person
      on conflict do nothing`);
    await q(`
      insert into thread_participants (thread_id, user_id, last_read_at)
      select 'thr_b_' || b.id, person, b.created_at + interval '1 day'
        from bookings b, unnest(array[b.helper_user_id, b.poster_user_id]) as person
      on conflict do nothing`);
    await q(`
      insert into messages (id, thread_id, sender_user_id, kind, body, created_at)
      select 'msg_' || p.thread_id || '_' || i, p.thread_id, p.users[1 + i % 2], 'text', 'Message ' || i || ' about the task, with enough words to look like a real one.', p.created_at + i * interval '17 minutes'
        from (select th.id as thread_id, th.created_at, th.kind, array_agg(tp.user_id order by tp.user_id) as users
                from threads th join thread_participants tp on tp.thread_id = th.id group by th.id) p,
             generate_series(1, case when p.kind = 'booking' then 12 else 4 end) as i
      on conflict do nothing`);

    // 60 notifications a person, from the seeded kinds; the newest 5 unread.
    await q(`
      insert into notifications (id, user_id, type, title, actor_name, params, target, source_event_id, created_at, read_at)
      select 'ntf_' || u.id || '_' || g, u.id, t.type, t.title, t.actor_name, t.params, t.target, 'evt_perf_' || u.id || '_' || g, now() - g * interval '7 hours', case when g > 5 then now() - g * interval '7 hours' + interval '1 hour' end
        from users u cross join generate_series(1, 60) as g
        join (select *, row_number() over (order by id) - 1 as k from orig_notifications) t on t.k = g % (select count(*) from orig_notifications)
      on conflict do nothing`);

    await q('set session_replication_role = origin');
    await q('analyze');
    const after: Record<string, number> = {};
    for (const table of tables) {
      const count = Number((await q<{ count: string }>(`select count(*) from "${table}"`))[0]!.count);
      if (count > 0 && !REFERENCE_TABLES.has(table)) after[table] = count;
    }
    return after;
  } finally {
    await client.end();
  }
}
