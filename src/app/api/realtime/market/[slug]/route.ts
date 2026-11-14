import type { TaskPublicView } from '@/contracts';
import { findPublicMarket } from '@/modules/markets/queries';
import { findTaskWithPublicView } from '@/modules/tasks/queries';
import { db } from '@/platform/db/client';
import { marketChannel } from '@/platform/realtime/hub';
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
 * A market's public live events (completion plan 7.6): newly posted open tasks, as the board shows them (the
 * general area only, never an address). No sign-in. The notice through Postgres carries the task's id only; the
 * public view is read here, once per task for all the open streams.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const market = await findPublicMarket(slug, db);
  if (!market) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const hub = realtimeHub();
  if (hub.count() >= MAX_PUBLIC_STREAMS) return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '120' } });
  return sseResponse(request.signal, (out) =>
    hub.subscribe(marketChannel(market.id), (notice) => {
      if (notice.type !== 'task.posted' || typeof notice.task !== 'string') return;
      void publicTask(notice.task).then((view) => {
        if (view) out.send('task', view);
      });
    }),
  );
}
