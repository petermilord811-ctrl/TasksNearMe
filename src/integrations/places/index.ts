import 'server-only';
import { devHelpersOn } from '@/shared/dev-helpers';
import { createOverpassPlaces } from './overpass';
import { createSamplePlaces } from './sample';
import type { PlacesSource } from './types';

export type { AreaFacts, MapPlace, PlacesSource } from './types';

/**
 * Places port (what's around a task's area on the task map, `src/modules/task-map`). Production asks OpenStreetMap
 * through Overpass (`overpass.ts`: free, keyless, fair use, a week's memory per area). Development and the e2e build
 * use made-up "Sample …" places (`sample.ts`), so screens and tests never reach it.
 */
export function createPlacesSource(env: Record<string, string | undefined> = process.env): PlacesSource {
  if (devHelpersOn(env)) return createSamplePlaces();
  const site = (env.APP_URL ?? 'https://tasksnearme.com').trim().replace(/\/+$/, '');
  return createOverpassPlaces({ userAgent: `TasksNearMe (+${site})` });
}

let shared: PlacesSource | undefined;

/** The app's places source, one per process so its memory of answers is shared by every request. */
export function placesSource(): PlacesSource {
  shared ??= createPlacesSource();
  return shared;
}
