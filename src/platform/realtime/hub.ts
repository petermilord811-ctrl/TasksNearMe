/**
 * Live notices inside one server (completion plan 7.1): the open streams subscribe to a channel, and the one
 * LISTEN connection (./listener.ts) emits what Postgres delivers. A notice carries ids and a type only, never
 * text or personal data: the page that receives it reads the rest the usual way, with the usual permissions.
 *
 * Channels: `user:<id>` (a person's own notices, for their signed-in streams) and `market:<id>` (public events
 * of a market, for its boards).
 */
export type RealtimeValue = string | number | boolean;
export interface RealtimeNotice {
  type: string;
  [key: string]: RealtimeValue | undefined;
}
export interface RealtimeEnvelope {
  channel: string;
  notice: RealtimeNotice;
}
type Listener = (notice: RealtimeNotice) => void;

const CHANNEL = /^(user|market):[A-Za-z0-9_]{1,80}$/;
const KEY = /^[a-z][A-Za-z]{0,30}$/;
/** pg_notify payloads are limited to 8000 bytes; notices stay far below. */
export const MAX_ENVELOPE_BYTES = 2000;

export const userChannel = (userId: string) => `user:${userId}`;
export const marketChannel = (marketId: string) => `market:${marketId}`;

/** A well-formed envelope from a NOTIFY payload, or null (anything else is dropped). */
export function parseEnvelope(payload: string): RealtimeEnvelope | null {
  if (payload.length > MAX_ENVELOPE_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const { channel, notice } = value as { channel?: unknown; notice?: unknown };
  if (typeof channel !== 'string' || !CHANNEL.test(channel) || !notice || typeof notice !== 'object' || Array.isArray(notice)) return null;
  const clean: RealtimeNotice = { type: '' };
  for (const [key, item] of Object.entries(notice as Record<string, unknown>)) {
    if (!KEY.test(key)) return null;
    if (typeof item === 'string' ? item.length > 120 : typeof item !== 'number' && typeof item !== 'boolean') return null;
    clean[key] = item as RealtimeValue;
  }
  if (typeof clean.type !== 'string' || !/^[a-z][a-z_.]{1,40}$/.test(clean.type)) return null;
  return { channel, notice: clean };
}

export class RealtimeHub {
  private readonly channels = new Map<string, Set<Listener>>();

  subscribe(channel: string, listener: Listener): () => void {
    const listeners = this.channels.get(channel) ?? new Set<Listener>();
    listeners.add(listener);
    this.channels.set(channel, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.channels.delete(channel);
    };
  }

  /** Hands the notice to every stream on its channel; one failing stream never stops the others. */
  emit(envelope: RealtimeEnvelope): number {
    const listeners = this.channels.get(envelope.channel);
    if (!listeners) return 0;
    let delivered = 0;
    for (const listener of [...listeners]) {
      try {
        listener(envelope.notice);
        delivered++;
      } catch (error) {
        console.error('[realtime] a stream failed to take a notice', error);
      }
    }
    return delivered;
  }

  /** Open streams on a channel (or on all of them). */
  count(channel?: string): number {
    if (channel) return this.channels.get(channel)?.size ?? 0;
    let total = 0;
    for (const listeners of this.channels.values()) total += listeners.size;
    return total;
  }
}
