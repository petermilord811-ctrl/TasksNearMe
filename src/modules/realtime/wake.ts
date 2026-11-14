import { dispatchNotifications } from '@/modules/notifications/service';
import type { Db } from '@/platform/db/connect';
import { onOutboxInsert } from '@/platform/realtime/listener';

/**
 * Runs the claiming dispatcher (src/modules/notifications/service.ts) as soon as an outbox event is inserted
 * anywhere (migration 0055's trigger, heard on this server's LISTEN connection), so a new message's live notice
 * goes out in well under a second (completion plan 7.1). Debounced by 50 ms; one run at a time per server, with
 * one more run when events arrived during it. Claims keep the servers' dispatchers from handling an event twice,
 * and the job runner's minute stays the fallback.
 */
export function startOutboxWake(db: Db, debounceMs = 50): void {
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let again = false;
  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await dispatchNotifications(db, new Date());
      } while (again);
    } catch (error) {
      console.error('[realtime] waking the dispatcher failed', error);
    } finally {
      running = false;
    }
  };
  onOutboxInsert(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, debounceMs);
    timer.unref?.();
  });
}
