import type { NearbyTaskPin, TaskMapBundle, TaskMapData, TaskPlace, TaskSurroundings, TaskWeather, WeatherHour } from '@/contracts';
import { crestviewArea, muellerArea } from './locations';
import { DESK_TIMES } from './timeline';

/**
 * The task map's states (contracts/task-map.ts): a helper planning the yard task (their home neighborhood, two open
 * tasks nearby, a hot day with an alert), the same task on a stormy day, the desk task indoors (the short weather), a
 * task whose forecast isn't out yet with the places unavailable, and a window that runs past sunset. Places are
 * "Sample …", never real businesses.
 */

const YARD_WINDOW = { windowStart: '2026-11-28T15:00:00.000Z', windowEnd: '2026-11-28T18:00:00.000Z', flexible: false };

const hour = (at: string, tempF: number, rainChance: number, condition: WeatherHour['condition'], extra: Partial<WeatherHour> = {}): WeatherHour => ({ at, tempF, rainChance, windMph: 8, condition, isDaytime: true, ...extra });

export const taskMapWeatherHeat: TaskWeather = {
  status: 'forecast',
  hours: [
    hour('2026-11-28T15:00:00.000Z', 84, 5, 'clear', { feelsLikeF: 88 }),
    hour('2026-11-28T16:00:00.000Z', 88, 10, 'clear', { feelsLikeF: 94 }),
    hour('2026-11-28T17:00:00.000Z', 91, 20, 'partly-cloudy', { feelsLikeF: 99, windMph: 12 }),
  ],
  summary: { lowF: 84, highF: 91, feelsLikeMaxF: 99, rainChanceMax: 20, windMaxMph: 12, condition: 'clear' },
  flags: ['heat'],
  alerts: [{ event: 'Heat Advisory', severity: 'moderate', ends: '2026-11-29T01:00:00.000Z' }],
  source: 'nws',
};

export const taskMapWeatherStorm: TaskWeather = {
  status: 'forecast',
  hours: [
    hour('2026-11-28T15:00:00.000Z', 68, 30, 'cloudy'),
    hour('2026-11-28T16:00:00.000Z', 70, 60, 'thunderstorm', { windMph: 22 }),
    hour('2026-11-28T17:00:00.000Z', 69, 70, 'thunderstorm', { windMph: 24 }),
  ],
  summary: { lowF: 68, highF: 70, rainChanceMax: 70, windMaxMph: 24, condition: 'thunderstorm' },
  flags: ['storm', 'wind'],
  alerts: [],
  source: 'nws',
};

export const taskMapWeatherIndoor: TaskWeather = {
  status: 'forecast',
  hours: [
    hour('2026-11-21T16:00:00.000Z', 64, 5, 'clear'),
    hour('2026-11-21T17:00:00.000Z', 67, 5, 'clear'),
    hour('2026-11-21T18:00:00.000Z', 70, 5, 'partly-cloudy'),
  ],
  summary: { lowF: 64, highF: 70, rainChanceMax: 5, windMaxMph: 8, condition: 'clear' },
  flags: [],
  alerts: [],
  source: 'nws',
};

export const taskMapWeatherDark: TaskWeather = {
  status: 'forecast',
  hours: [
    hour('2026-11-28T22:00:00.000Z', 66, 5, 'clear'),
    hour('2026-11-28T23:00:00.000Z', 63, 5, 'clear'),
    hour('2026-11-29T00:00:00.000Z', 60, 5, 'clear', { isDaytime: false }),
  ],
  summary: { lowF: 60, highF: 66, rainChanceMax: 5, windMaxMph: 8, condition: 'clear' },
  flags: ['dark'],
  alerts: [],
  sunset: '2026-11-28T23:32:00.000Z',
  source: 'nws',
};

export const taskMapWeatherLater: TaskWeather = { status: 'later', availableFrom: '2026-11-22T15:00:00.000Z', alerts: [], source: 'nws' };
export const taskMapWeatherUnavailable: TaskWeather = { status: 'unavailable' };

const place = (id: string, kind: TaskPlace['kind'], name: string, north: number, east: number, miles: number): TaskPlace => ({ id, kind, name, point: { lat: crestviewArea.publicPoint.lat + north, lng: crestviewArea.publicPoint.lng + east }, miles });

export const taskMapAroundYard: TaskSurroundings = {
  status: 'found',
  landmarks: [
    place('sample:park', 'park', 'Sample Park', 0.004, 0.003, 0.3),
    place('sample:school', 'school', 'Sample Elementary School', -0.006, 0.005, 0.5),
    place('sample:library', 'library', 'Sample Branch Library', 0.009, -0.007, 0.8),
  ],
  helpful: [
    place('sample:garden', 'garden', 'Sample Garden Center', 0.03, -0.02, 2.4),
    place('sample:recycling', 'recycling', 'Sample Recycling Center', -0.05, 0.06, 5.4),
    place('sample:hardware', 'hardware', 'Sample Hardware', 0.018, 0.012, 1.5),
  ],
  parkingLots: 4,
  homes: 'houses',
  source: 'osm',
};

export const taskMapAroundDesk: TaskSurroundings = {
  status: 'found',
  landmarks: [place('sample:park', 'park', 'Sample Park', 0.004, 0.003, 0.3)],
  helpful: [place('sample:hardware', 'hardware', 'Sample Hardware', 0.018, 0.012, 1.5)],
  parkingLots: 0,
  homes: 'mixed',
  source: 'osm',
};

export const taskMapAroundUnavailable: TaskSurroundings = { status: 'unavailable' };

export const taskMapNearbyTasks: NearbyTaskPin[] = [
  { id: 'tsk_near_gutter', title: 'Clear the gutters on a one-story house', href: '/app/find-work/tsk_near_gutter', point: { lat: 30.3521, lng: -97.7213 }, budget: { type: 'fixed', priceCents: 9000 }, windowStart: '2026-11-28T19:00:00.000Z', miles: 0.4, sameDay: true },
  { id: 'tsk_near_hedge', title: 'Trim two hedges along the driveway', href: '/app/find-work/tsk_near_hedge', point: { lat: 30.3412, lng: -97.7301 }, budget: { type: 'hourly', rateCents: 3200, estimatedHours: 2, hoursCap: 3 }, windowStart: '2026-11-30T15:00:00.000Z', miles: 1.1, sameDay: false },
];


export const taskMapYardHelperData: TaskMapData = {
  taskId: 'tsk_yard',
  area: { name: crestviewArea.areaName, marketName: crestviewArea.marketName, point: crestviewArea.publicPoint, radiusMeters: crestviewArea.radiusMeters },
  schedule: YARD_WINDOW,
  timeZone: 'America/Chicago',
  category: 'yard-cleanup',
  weatherWeight: 'high',
  home: { name: 'Hyde Park', point: { lat: 30.3055, lng: -97.7279 } },
  nearbyTasks: taskMapNearbyTasks,
  viewer: 'helper',
};

export const taskMapDeskVisitorData: TaskMapData = {
  taskId: 'tsk_desk',
  area: { name: muellerArea.areaName, marketName: muellerArea.marketName, point: muellerArea.publicPoint, radiusMeters: muellerArea.radiusMeters },
  schedule: { windowStart: DESK_TIMES.windowStart, windowEnd: DESK_TIMES.windowEnd, flexible: false },
  timeZone: 'America/Chicago',
  category: 'furniture-assembly',
  weatherWeight: 'low',
  nearbyTasks: [],
  viewer: 'visitor',
};

const bundle = (data: TaskMapData, weather: TaskWeather, surroundings: TaskSurroundings): TaskMapBundle => ({ data, weather: Promise.resolve(weather), surroundings: Promise.resolve(surroundings) });

/** A helper planning the yard task: from their home neighborhood, a hot day with an alert, two open tasks nearby. */
export const taskMapHelperBundle = bundle(taskMapYardHelperData, taskMapWeatherHeat, taskMapAroundYard);
/** The yard task for a visitor on a stormy day. */
export const taskMapStormBundle = bundle({ ...taskMapYardHelperData, home: undefined, nearbyTasks: [], viewer: 'visitor' }, taskMapWeatherStorm, taskMapAroundYard);
/** The desk task indoors: the short weather, a hardware store for the parts. */
export const taskMapIndoorBundle = bundle(taskMapDeskVisitorData, taskMapWeatherIndoor, taskMapAroundDesk);
/** The poster's own desk task a week out: the forecast isn't out yet, and the places can't be had. */
export const taskMapLaterBundle = bundle({ ...taskMapDeskVisitorData, viewer: 'poster' }, taskMapWeatherLater, taskMapAroundUnavailable);
/** An evening yard window that runs past sunset. */
export const taskMapDarkBundle = bundle({ ...taskMapYardHelperData, schedule: { windowStart: '2026-11-28T22:00:00.000Z', windowEnd: '2026-11-29T01:00:00.000Z', flexible: false } }, taskMapWeatherDark, taskMapAroundYard);
/** The forecast service is down. */
export const taskMapUnavailableBundle = bundle({ ...taskMapYardHelperData, nearbyTasks: [] }, taskMapWeatherUnavailable, taskMapAroundYard);
