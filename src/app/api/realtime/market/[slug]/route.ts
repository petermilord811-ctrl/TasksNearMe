import type { TaskLiveState, TaskPublicView } from '@/contracts';
import { findPublicMarket } from '@/modules/markets/queries';
import { findTaskLiveState } from '@/modules/realtime/board';
import { findTaskWithPublicView } from '@/modules/tasks/queries';
import { db } from '@/platform/db/client';
import { marketChannel, type RealtimeNotice } from '@/platform/realtime/hub';
import { realtimeHub } from '@/platform/realtime/listener';
import { sseResponse } from '@/platform/realtime/sse';

/** Public streams per server before new ones are turned away (they fall back to the page as it loaded). */
const MAX_PUBLIC_STREAMS = 2000;
/** A newly posted task is read once for everyone watching, then kept for a little while. */
const TASK_TTL_MS = 30_000;
const recent = new Map<string, { at: number; view: Promise<TaskPublicView | null> }>();

function publicTask(taskId: string): Promise<TaskPublicView | null> {
  const now = Date.now();
  const hit = recent.get(taskId);
  if (hit && now - hit.at < TASK_TTL_MS) return hit.view;
  const view = findTaskWithPublicView(db, taskId)
    .then((found) => (found && found.view.status === 'open' ? found.view : null))
    .catch(() => null);
  recent.set(taskId, { at: now, view });
  if (recent.size > 500) for (const [id, entry] of recent) if (now - entry.at >= TASK_TTL_MS) recent.delete(id);
  return view;
}

/**
 * A changed task is read once per notice: the hub hands the same notice to every stream on the server, and a
 * later change is a new notice, so nobody gets a count read before it.
 */
const changed = new WeakMap<RealtimeNotice, Promise<TaskLiveState | null>>();

function liveState(notice: RealtimeNotice, taskId: string): Promise<TaskLiveState | null> {
  let state = changed.get(notice);
  if (!state) {
    state = findTaskLiveState(db, taskId).catch(() => null);
    changed.set(notice, state);
  }
  return state;
}

/**
 * A market's public live events (completion plan 7.6): newly posted open tasks, as the board shows them (the
 * general area only, never an address), and a task's offer count and whether it still takes offers when those
 * change. No sign-in. The notice through Postgres carries the task's id only; what's public is read here, once
 * per notice for all the open streams.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const market = await findPublicMarket(slug, db);
  if (!market) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const hub = realtimeHub();
  if (hub.count() >= MAX_PUBLIC_STREAMS) return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '120' } });
  return sseResponse(request.signal, (out) =>
    hub.subscribe(marketChannel(market.id), (notice) => {
      if (typeof notice.task !== 'string') return;
      if (notice.type === 'task.posted') {
        void publicTask(notice.task).then((view) => {
          if (view) out.send('task', view);
        });
      } else if (notice.type === 'task.changed') {
        void liveState(notice, notice.task).then((state) => {
          if (state) out.send('task-state', state);
        });
      }
    }),
  );
}
