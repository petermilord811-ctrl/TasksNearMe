import 'server-only';
import { Client } from 'pg';
import { parseEnvelope, RealtimeHub } from './hub';

/**
 * One LISTEN connection per server process (completion plan 7.1), outside the pool (the pool is 10 and a stream
 * may stay open for minutes). It hears two channels:
 * - `tnm_realtime`: live notices, fanned out in memory to this server's open streams (./hub.ts);
 * - `tnm_outbox`: a new outbox event (the trigger from migration 0055), which wakes the dispatcher at once.
 * It reconnects with a growing pause (1 s up to 30 s) after a drop. Kept across hot reloads in development.
 */
interface RealtimeRuntime {
  hub: RealtimeHub;
  client: Client | null;
  connecting: boolean;
  retryMs: number;
  outboxWake: (() => void) | null;
  url: string;
}

const KEY = Symbol.for('tasksnearme.realtime');

function runtime(): RealtimeRuntime {
  const holder = globalThis as unknown as Record<symbol, RealtimeRuntime | undefined>;
  holder[KEY] ??= { hub: new RealtimeHub(), client: null, connecting: false, retryMs: 1000, outboxWake: null, url: process.env.DATABASE_URL ?? '' };
  return holder[KEY];
}

function scheduleReconnect(rt: RealtimeRuntime): void {
  const wait = rt.retryMs;
  rt.retryMs = Math.min(rt.retryMs * 2, 30_000);
  setTimeout(() => void connect(rt), wait).unref();
}

async function connect(rt: RealtimeRuntime): Promise<void> {
  if (rt.client || rt.connecting || !rt.url) return;
  rt.connecting = true;
  const client = new Client({ connectionString: rt.url, application_name: 'tnm-realtime' });
  let dropped = false;
  const drop = (reason: string) => {
    if (dropped) return;
    dropped = true;
    if (rt.client === client) rt.client = null;
    console.warn(`[realtime] listener ${reason}; reconnecting`);
    client.end().catch(() => {});
    scheduleReconnect(rt);
  };
  client.on('notification', (message) => {
    if (message.channel === 'tnm_outbox') {
      rt.outboxWake?.();
      return;
    }
    if (message.channel !== 'tnm_realtime' || !message.payload) return;
    const envelope = parseEnvelope(message.payload);
    if (envelope) rt.hub.emit(envelope);
  });
  client.on('error', (error) => drop(`error: ${error.message}`));
  client.on('end', () => drop('ended'));
  try {
    await client.connect();
    await client.query('LISTEN tnm_realtime');
    await client.query('LISTEN tnm_outbox');
    rt.client = client;
    rt.retryMs = 1000;
  } catch (error) {
    drop(`could not connect: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rt.connecting = false;
  }
}

/** Starts the listener (idempotent). `url` defaults to DATABASE_URL; tests pass their own. */
export function startRealtimeListener(url?: string): RealtimeHub {
  const rt = runtime();
  if (url && url !== rt.url && !rt.client) rt.url = url;
  void connect(rt);
  return rt.hub;
}

/** This server's hub (starting the listener if it isn't yet). */
export function realtimeHub(): RealtimeHub {
  return startRealtimeListener();
}

/** Whether the LISTEN connection is up (for the streams' status and tests). */
export function realtimeConnected(): boolean {
  return runtime().client !== null;
}

/** What runs when an outbox event is inserted anywhere (the dispatcher); one handler per process. */
export function onOutboxInsert(wake: () => void): void {
  runtime().outboxWake = wake;
}

/** For tests: drop the connection and forget the handlers. */
export async function stopRealtimeListener(): Promise<void> {
  const rt = runtime();
  rt.outboxWake = null;
  const client = rt.client;
  rt.client = null;
  rt.url = '';
  if (client) {
    client.removeAllListeners('end');
    client.removeAllListeners('error');
    await client.end().catch(() => {});
  }
  const holder = globalThis as unknown as Record<symbol, RealtimeRuntime | undefined>;
  holder[KEY] = undefined;
}
