import 'server-only';
import { and, asc, eq, gte, isNotNull, lte, ne, notInArray, sql } from 'drizzle-orm';
import type { CategorySlug, MapPoint, NearbyTaskPin, TaskLocation, TaskMapBundle, TaskMapData, TaskPublicView, TaskSchedule, TaskSurroundings, TaskWeather } from '@/contracts';
import { routes } from '@/contracts/routes';
import { placesSource } from '@/integrations/places';
import { weatherSource } from '@/integrations/weather';
import type { Db } from '@/platform/db/connect';
import type { RowScope } from '@/shared/sample-data';
import { areas, markets } from '../markets/schema';
import { helperProfiles } from '../profiles/schema';
import { toTaskPublicView } from '../tasks/projections';
import { milesFrom, openIn, selectPublic, toRow } from '../tasks/queries';
import { tasks } from '../tasks/schema';
import { blockedPeopleOf } from '../trust/blocks';
import { surroundingsFrom } from './surroundings';
import { summarizeTaskWeather, WEATHER_WEIGHT } from './weather';

/**
 * The task map's data for a task page (contracts/task-map.ts): the area, the schedule and what the weather means for
 * this work now; the weather and what's around the area as promises the page streams in (they come from outside
 * services and never hold the page). A signed-in helper also gets their home neighborhood (a trip can start there) and
 * the open tasks near this one. Remote tasks have no map.
 */

/** Open tasks this close to the task's area count as "near" (miles, straight line). */
export const NEARBY_TASK_MILES = 2;
const MAX_NEARBY_TASKS = 5;
const MILES_PER_LAT = 69.05;

export type TaskMapViewer = { kind: 'visitor' } | { kind: 'member'; userId: string } | { kind: 'helper'; userId: string } | { kind: 'poster'; userId: string };

/** The task map's viewer from who a page says is looking (a signed-out visitor has no id). */
export function taskMapViewer(kind: 'visitor' | 'member' | 'helper' | 'poster', userId: string | null): TaskMapViewer {
  return kind === 'visitor' || !userId ? { kind: 'visitor' } : { kind, userId };
}

/** The weather for the task's time: never throws (a failure is "unavailable"). */
export async function taskWeatherFor(point: MapPoint, schedule: TaskSchedule, now: Date): Promise<TaskWeather> {
  try {
    const source = weatherSource();
    const window = { start: new Date(schedule.windowStart), end: new Date(schedule.windowEnd), flexible: schedule.flexible };
    if (window.end.getTime() <= now.getTime()) return { status: 'past' };
    const [hours, alerts] = await Promise.all([source.hourly(point), source.alerts(point)]);
    return summarizeTaskWeather({ hours, alerts, window, now, point, source: source.name });
  } catch {
    return { status: 'unavailable' };
  }
}

/** What's around the area: never throws (a failure is "unavailable"). */
export async function taskSurroundingsFor(point: MapPoint, category: CategorySlug): Promise<TaskSurroundings> {
  try {
    const source = placesSource();
    return surroundingsFrom(await source.around(point), point, category, source.name === 'overpass' ? 'osm' : 'sample');
  } catch {
    return { status: 'unavailable' };
  }
}

/** A helper's home neighborhood (its center: a trip can start there), if they've chosen one. */
export async function helperHomeOf(db: Db, userId: string): Promise<TaskMapData['home']> {
  const [row] = await db
    .select({ name: areas.name, lat: areas.centerLat, lng: areas.centerLng })
    .from(helperProfiles)
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(eq(helperProfiles.userId, userId))
    .limit(1);
  return row ? { name: row.name, point: { lat: row.lat, lng: row.lng } } : undefined;
}

/**
 * Open tasks near this one (its market's, nearest first), for a helper planning a trip: links go to Find work's page.
 * `dayKey` says whether one falls on the task's own day in the market's zone.
 */
export async function nearbyOpenTasks(
  db: Db,
  input: { taskId: string; marketId: string; point: MapPoint; now: Date; rows?: RowScope; /** The helper and the people they blocked or who blocked them. */ excludePosterIds: string[]; dayKey: (iso: string) => string; taskDay: string; href: (task: TaskPublicView) => string },
): Promise<NearbyTaskPin[]> {
  const latSpan = NEARBY_TASK_MILES / MILES_PER_LAT;
  const lngSpan = NEARBY_TASK_MILES / (69.17 * Math.cos((input.point.lat * Math.PI) / 180));
  const distance = milesFrom(input.point);
  const rows = await selectPublic(db)
    .where(
      and(
        ...openIn(input.marketId, input.now, input.rows),
        ne(tasks.id, input.taskId),
        ne(tasks.mode, 'remote'),
        isNotNull(tasks.publicLat),
        gte(tasks.publicLat, input.point.lat - latSpan),
        lte(tasks.publicLat, input.point.lat + latSpan),
        gte(tasks.publicLng, input.point.lng - lngSpan),
        lte(tasks.publicLng, input.point.lng + lngSpan),
        sql`${distance} <= ${NEARBY_TASK_MILES}`,
        ...(input.excludePosterIds.length > 0 ? [notInArray(tasks.posterUserId, input.excludePosterIds)] : []),
      ),
    )
    .orderBy(asc(distance))
    .limit(MAX_NEARBY_TASKS);
  return rows.flatMap((row) => {
    const view = toTaskPublicView(toRow(row));
    if (view.location.kind !== 'local') return [];
    const point = view.location.publicPoint;
    const miles = Math.hypot((point.lat - input.point.lat) * MILES_PER_LAT, (point.lng - input.point.lng) * 69.17 * Math.cos((input.point.lat * Math.PI) / 180));
    return [{
      id: view.id,
      title: view.title,
      href: input.href(view),
      point,
      budget: view.budget,
      windowStart: view.schedule.windowStart,
      miles: Math.round(miles * 10) / 10,
      sameDay: input.dayKey(view.schedule.windowStart) === input.taskDay,
    }];
  });
}

/** "2026-11-28" in a zone, for comparing days. */
export function zonedDayKey(timeZone: string): (iso: string) => string {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (iso: string) => format.format(new Date(iso));
}

/**
 * The task map for a task page, or null for a remote task. `viewer.kind`: a helper (who can offer or is booked) plans
 * the trip from their home neighborhood and sees the open tasks near this one; the poster sees what helpers see.
 */
export async function taskMapFor(
  db: Db,
  input: { task: { id: string; location: TaskLocation; schedule: TaskSchedule; categorySlug: CategorySlug }; viewer: TaskMapViewer; now: Date; rows?: RowScope },
): Promise<TaskMapBundle | null> {
  const { task, viewer, now } = input;
  if (task.location.kind !== 'local') return null;
  const location = task.location;
  const point = location.publicPoint;
  const [own] = await db.select({ marketId: tasks.marketId, timeZone: markets.timeZone }).from(tasks).innerJoin(markets, eq(markets.id, tasks.marketId)).where(eq(tasks.id, task.id)).limit(1);
  if (!own) return null;
  const helper = viewer.kind === 'helper' ? viewer.userId : null;
  const dayKey = zonedDayKey(own.timeZone);
  const [home, nearbyTasks] = await Promise.all([
    helper ? helperHomeOf(db, helper) : Promise.resolve(undefined),
    helper
      ? blockedPeopleOf(db, helper).then((blocked) => nearbyOpenTasks(db, { taskId: task.id, marketId: own.marketId, point, now, rows: input.rows, excludePosterIds: [helper, ...blocked], dayKey, taskDay: dayKey(task.schedule.windowStart), href: (nearby) => routes.app.findWorkTask(nearby.id) }))
      : Promise.resolve([]),
  ]);
  const data: TaskMapData = {
    taskId: task.id,
    area: { name: location.areaName, marketName: location.marketName, ...(location.outsideMarket ? { outsideMarket: true as const } : {}), point, radiusMeters: location.radiusMeters },
    schedule: task.schedule,
    timeZone: own.timeZone,
    category: task.categorySlug,
    weatherWeight: WEATHER_WEIGHT[task.categorySlug],
    ...(home ? { home } : {}),
    nearbyTasks,
    viewer: viewer.kind,
  };
  return { data, weather: taskWeatherFor(point, task.schedule, now), surroundings: taskSurroundingsFor(point, task.categorySlug) };
}
