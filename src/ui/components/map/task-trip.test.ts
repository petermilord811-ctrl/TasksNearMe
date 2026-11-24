import { describe, expect, it } from 'vitest';
import { buildRoadGraph, type RoadLine } from '@/ui/landing/map/drive-times';
import { driveMinutesFor, isRushHour, linesFor, routeOnRoads, splitMinutes, straightTrips } from './task-trip';

const ORIGIN = { lat: 30.3, lng: -97.74 };
/** A point `east` miles east and `north` miles north of the origin. */
const offset = (east: number, north: number) => ({ lat: ORIGIN.lat + north / 69.05, lng: ORIGIN.lng + east / (69.17 * Math.cos((ORIGIN.lat * Math.PI) / 180)) });
const line = (className: string, ...points: { lat: number; lng: number }[]): RoadLine => ({ className, coordinates: points.map((point) => [point.lng, point.lat]) });

describe('the trip to a task', () => {
  it('offers a walk and a bike ride only when they make sense', () => {
    expect(straightTrips(ORIGIN, offset(1, 0)).map((trip) => trip.mode)).toEqual(['drive', 'bike', 'walk']);
    expect(straightTrips(ORIGIN, offset(5, 0)).map((trip) => trip.mode)).toEqual(['drive', 'bike']);
    expect(straightTrips(ORIGIN, offset(20, 0)).map((trip) => trip.mode)).toEqual(['drive']);
  });

  it('estimates from the straight line with a city detour', () => {
    const [drive, bike, walk] = straightTrips(ORIGIN, offset(1.2, 0));
    expect(drive).toMatchObject({ basis: 'straight', miles: 1.6, minutes: 4 });
    expect(bike).toMatchObject({ miles: 1.6, minutes: 10 });
    expect(walk).toMatchObject({ miles: 1.5, minutes: 30 });
    expect(driveMinutesFor(10)).toBe(27);
  });

  it('knows weekday rush hours in the task’s zone', () => {
    expect(isRushHour(new Date('2026-11-23T23:00:00Z'), 'America/Chicago')).toBe(true); // Mon 5 pm
    expect(isRushHour(new Date('2026-11-23T19:00:00Z'), 'America/Chicago')).toBe(false); // Mon 1 pm
    expect(isRushHour(new Date('2026-11-28T23:00:00Z'), 'America/Chicago')).toBe(false); // Sat 5 pm
    expect(isRushHour(new Date('2026-11-23T13:30:00Z'), 'America/New_York')).toBe(true); // Mon 8:30 am
  });

  it('keeps bikes and walks off freeways', () => {
    const lines = [line('motorway', ORIGIN, offset(3, 0)), line('minor', ORIGIN, offset(0, 1))];
    expect(linesFor('drive', lines)).toHaveLength(2);
    expect(linesFor('walk', lines).map((road) => road.className)).toEqual(['minor']);
  });

  it('routes along the roads: the quick way for a drive, the short way for a walk', () => {
    // An L of minor streets (2 miles) and a looping motorway (4 miles, but quicker to drive), both to the target.
    const target = offset(1, 1);
    const lines = [
      line('minor', ORIGIN, offset(1, 0), target),
      line('motorway', ORIGIN, offset(0, -0.5), offset(1.5, -0.5), offset(1.5, 1), target),
    ];
    const drive = routeOnRoads(buildRoadGraph(linesFor('drive', lines), ORIGIN), target, 'drive');
    expect(drive).not.toBeNull();
    expect(drive!.miles).toBeCloseTo(4, 1);
    expect(drive!.minutes).toBe(5);
    const walk = routeOnRoads(buildRoadGraph(linesFor('walk', lines), ORIGIN), target, 'walk');
    expect(walk!.miles).toBeCloseTo(2, 1);
    expect(walk!.minutes).toBe(40);
    expect(walk!.path[0]).toEqual([ORIGIN.lng, ORIGIN.lat]);
    expect(walk!.path.at(-1)).toEqual([target.lng, target.lat]);
  });

  it('has no route when the loaded roads do not reach the target', () => {
    const lines = [line('minor', ORIGIN, offset(1, 0))];
    expect(routeOnRoads(buildRoadGraph(lines, ORIGIN), offset(10, 10), 'drive')).toBeNull();
    expect(routeOnRoads(buildRoadGraph([], ORIGIN), offset(0.1, 0), 'drive')).toBeNull();
  });

  it('splits minutes into hours and minutes', () => {
    expect(splitMinutes(45)).toEqual({ hours: 0, minutes: 45 });
    expect(splitMinutes(125)).toEqual({ hours: 2, minutes: 5 });
    expect(splitMinutes(0)).toEqual({ hours: 0, minutes: 1 });
  });
});
