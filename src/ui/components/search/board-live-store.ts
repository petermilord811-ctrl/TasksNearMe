import { useSyncExternalStore } from 'react';
import type { TaskLiveState } from '@/contracts';

/**
 * What the market's public stream has said about tasks on the board (completion plan 7.6): BoardLive writes, each
 * row's offer count reads its own task. A row trusts a state only if it was read after the page was rendered
 * (`readAt` against the page's `now`, both the server's clock), so a refreshed page's numbers win over older news.
 */
const states = new Map<string, TaskLiveState>();
const listeners = new Set<() => void>();

export function setTaskLiveState(state: TaskLiveState): void {
  const known = states.get(state.id);
  if (known && Date.parse(known.readAt) > Date.parse(state.readAt)) return;
  states.set(state.id, state);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The task's live state if the stream has news newer than the page (`renderedAt`), otherwise nothing. */
export function useTaskLiveState(taskId: string, renderedAt: string): TaskLiveState | undefined {
  const state = useSyncExternalStore(subscribe, () => states.get(taskId), () => undefined);
  return state && Date.parse(state.readAt) > Date.parse(renderedAt) ? state : undefined;
}

/** For tests: forget everything heard. */
export function resetTaskLiveStates(): void {
  states.clear();
  for (const listener of listeners) listener();
}
