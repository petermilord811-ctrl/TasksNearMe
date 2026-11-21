'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { TaskLiveState, TaskMapPin, TaskPublicView } from '@/contracts';
import type { LatLng } from '@/shared/geo';
import { taskMapPinOf } from '@/shared/map-pins';
import { retryingEventSource } from '@/ui/lib/retrying-event-source';

/**
 * The landing map, live (owner, 2026-11-20): the market's public stream (`/api/realtime/market/<slug>`, the same one
 * the task board listens to, with its rules: the general area only, no sample tasks for signed-out visitors, a cap
 * per address) says when a task is posted, when its offers change and when it's booked or closes. A new task drops
 * onto the map and a note says so; an offer or a booking pulses softly where the task is (its public area, never an
 * address); a booked or closed task leaves the map. Nothing counts who is looking. A refused or failed stream (a
 * deploy's restart, too many streams) is opened again, as the board's is (src/ui/lib/retrying-event-source.ts); without
 * one (no EventSource, offline) the map is simply the page as it loaded.
 */

export type PulseKind = 'new' | 'offer' | 'booked';

export interface MapPulse {
  key: number;
  taskId: string;
  point: LatLng;
  kind: PulseKind;
  category: string;
}

export interface LiveTasks {
  /** The open tasks now: the page's, with new ones first, and booked or closed ones gone. */
  pins: TaskMapPin[];
  /** Tasks that just arrived (they drop in). */
  arrivals: ReadonlySet<string>;
  /** Pulses still showing (each lasts `PULSE_MS`). */
  pulses: MapPulse[];
  /** The newest arrival, for the note on the map (cleared after `NOTE_MS`, or when dismissed). */
  latest: TaskMapPin | null;
  dismissLatest: () => void;
}

/** A tab in the background lets its stream go after this long, and opens it again when it's back. */
const HIDDEN_CLOSE_MS = 120_000;
export const PULSE_MS = 2400;
const ARRIVAL_MS = 2600;
const NOTE_MS = 9000;
/** A booked or closed task stays this long, so its pulse is seen, then leaves. */
const LEAVE_AFTER_MS = 1400;
/** The most tasks the map keeps (new ones push the oldest off). */
const MAX_PINS = 80;

export function useLiveTasks(initial: TaskMapPin[], marketSlug: string | undefined, options: { enabled: boolean; reduced: boolean }): LiveTasks {
  const [added, setAdded] = useState<TaskMapPin[]>([]);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [offers, setOffers] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [arrivals, setArrivals] = useState<ReadonlySet<string>>(() => new Set());
  const [pulses, setPulses] = useState<MapPulse[]>([]);
  const [latest, setLatest] = useState<TaskMapPin | null>(null);
  const timers = useRef(new Set<number>());
  const pulseKey = useRef(0);

  const pins = useMemo(() => {
    const known = new Set(initial.map((pin) => pin.id));
    const merged = [...added.filter((pin) => !known.has(pin.id)), ...initial].filter((pin) => !gone.has(pin.id));
    return merged.slice(0, MAX_PINS).map((pin) => {
      const count = offers.get(pin.id);
      return count === undefined || count === pin.offerCount ? pin : { ...pin, offerCount: count };
    });
  }, [initial, added, gone, offers]);
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  const later = (ms: number, run: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      run();
    }, ms);
    timers.current.add(id);
  };
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  const pulse = (pin: TaskMapPin, kind: PulseKind) => {
    if (options.reduced) return;
    pulseKey.current += 1;
    const key = pulseKey.current;
    setPulses((current) => [...current.slice(-11), { key, taskId: pin.id, point: pin.point, kind, category: pin.categorySlug }]);
    later(PULSE_MS, () => setPulses((current) => current.filter((item) => item.key !== key)));
  };

  const onTask = useEffectEvent((task: TaskPublicView) => {
    const pin = taskMapPinOf(task);
    if (!pin || task.status !== 'open') return;
    if (pinsRef.current.some((item) => item.id === pin.id)) return;
    setGone((current) => {
      if (!current.has(pin.id)) return current;
      const next = new Set(current);
      next.delete(pin.id);
      return next;
    });
    setAdded((current) => [pin, ...current.filter((item) => item.id !== pin.id)].slice(0, MAX_PINS));
    setLatest(pin);
    later(NOTE_MS, () => setLatest((current) => (current?.id === pin.id ? null : current)));
    if (!options.reduced) {
      setArrivals((current) => new Set(current).add(pin.id));
      later(ARRIVAL_MS, () =>
        setArrivals((current) => {
          if (!current.has(pin.id)) return current;
          const next = new Set(current);
          next.delete(pin.id);
          return next;
        }),
      );
    }
    pulse(pin, 'new');
  });

  const onState = useEffectEvent((state: TaskLiveState) => {
    const pin = pinsRef.current.find((item) => item.id === state.id);
    if (!pin) return;
    if (state.state === 'open') {
      if (state.offerCount > pin.offerCount) pulse(pin, 'offer');
      setOffers((current) => (current.get(pin.id) === state.offerCount ? current : new Map(current).set(pin.id, state.offerCount)));
      return;
    }
    if (state.state === 'booked') pulse(pin, 'booked');
    setLatest((current) => (current?.id === pin.id ? null : current));
    later(options.reduced ? 0 : LEAVE_AFTER_MS, () => setGone((current) => (current.has(pin.id) ? current : new Set(current).add(pin.id))));
  });

  useEffect(() => {
    if (!options.enabled || !marketSlug || typeof EventSource === 'undefined') return;
    let stream: { close: () => void } | null = null;
    let hiddenTimer: number | undefined;
    const listen = (source: EventSource) => {
      source.addEventListener('task', (event) => {
        try {
          const task = JSON.parse((event as MessageEvent<string>).data) as TaskPublicView;
          if (task?.id && task.location && task.schedule) onTask(task);
        } catch {
          /* not a task: ignore */
        }
      });
      source.addEventListener('task-state', (event) => {
        try {
          const state = JSON.parse((event as MessageEvent<string>).data) as TaskLiveState;
          if (state?.id && typeof state.offerCount === 'number' && typeof state.state === 'string') onState(state);
        } catch {
          /* not a state: ignore */
        }
      });
    };
    const open = () => {
      if (!stream) stream = retryingEventSource(`/api/realtime/market/${encodeURIComponent(marketSlug)}`, listen);
    };
    const close = () => {
      stream?.close();
      stream = null;
    };
    const onVisibility = () => {
      window.clearTimeout(hiddenTimer);
      if (document.visibilityState === 'hidden') hiddenTimer = window.setTimeout(close, HIDDEN_CLOSE_MS);
      else open();
    };
    open();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(hiddenTimer);
      close();
    };
  }, [options.enabled, marketSlug]);

  const dismissLatest = useMemo(() => () => setLatest(null), []);
  return { pins, arrivals, pulses, latest, dismissLatest };
}
