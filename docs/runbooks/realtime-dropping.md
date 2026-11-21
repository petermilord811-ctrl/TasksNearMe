# Live updates stop

Open pages stop updating by themselves: a new message doesn't appear until a reload, offer counts on the task board stand still, the bell doesn't move. Severity: **SEV3** (nothing is lost; people see everything on their next page load), **SEV2** if it lasts beyond a few minutes during busy hours.

## How it works

Each server process keeps one Postgres `LISTEN` connection. The app publishes notices with `pg_notify` (ids only, never content) and streams them to browsers as server-sent events. The streams are `/api/realtime` (signed in) and `/api/realtime/market/<slug>` (task boards, community pages, the landing map). Code: `src/platform/realtime/` (listener, hub, sse), `src/ui/lib/realtime.tsx`, `src/ui/lib/retrying-event-source.ts`.

## What recovers by itself

| Break | Recovery |
|---|---|
| The `LISTEN` connection drops (database restart, network blip) | The server listens again, backing off from 1 to 30 s. 2 s in the rehearsal. |
| A browser's stream drops | The browser reconnects (the server asks for 3 s). |
| A stream is refused: `429` (more than 20 streams from one address, 8 per person), `503` (more than 2,000 per server), or the `502` Caddy answers while the server restarts for a deploy | Signed-in pages open it again after 10 s, doubling to a minute. Task boards and community pages do the same since 2026-11-21 (before, they stayed quiet until reloaded). The landing page's live map doesn't yet: a reload brings it back. |

Notices published while a page wasn't listening are not replayed. The page shows them on its next load, since everything they point to is in the database.

## How you find out

- People report a page that "didn't update". Nothing pages for this.
- The server log: `[realtime] listener …; reconnecting` lines that keep coming mean the listener can't get back.
- One `LISTEN` connection per server process: `select pid, backend_start from pg_stat_activity where query ilike 'listen%'`. None means live notices are down for that server.

## What to do

1. If the listener keeps reconnecting, the database is the problem: [The database is unreachable](database-unreachable.md).
2. If streams are refused in bulk (429 or 503 in Caddy's log), look for one address opening many streams, or traffic over the 2,000-stream cap.
3. A restart (`sudo systemctl restart tasksnearme-preview`) gives every server a fresh listener, and pages reconnect by themselves.

## Rehearsed

2026-11-21 on the e2e build (sweep, "When things break"):
- the listener's backend was terminated and the server listened again within 2 s;
- a task board's stream was refused with a 503, and the board opened it again 10 s later.
