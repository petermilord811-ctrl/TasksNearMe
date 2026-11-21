import { describe, expect, it } from 'vitest';
import { buildRoadGraph, CITY_FACTOR, driveMinutes, reachedRoads, type RoadLine } from './drive-times';

const origin = { lat: 29.65, lng: -82.33 };
const milesPerLng = 69.17 * Math.cos((origin.lat * Math.PI) / 180);
/** A point `miles` east of the origin, as [lng, lat]. */
const east = (miles: number): [number, number] => [origin.lng + miles / milesPerLng, origin.lat];
const road = (className: string, ...miles: number[]): RoadLine => ({ className, coordinates: miles.map(east) });
/** Minutes for a mile of a 25 mph street, lights and turns included. */
const MINOR_MILE = (60 / 25) * CITY_FACTOR;

describe('drive times from the roads the map has loaded', () => {
  it('times each road by its class', () => {
    const graph = buildRoadGraph([road('minor', 0, 1, 2)], origin);
    const times = driveMinutes(graph, 30);
    expect(times[0]).toBeCloseTo(0, 5);
    expect(times[1]).toBeCloseTo(MINOR_MILE, 3);
    expect(times[2]).toBeCloseTo(2 * MINOR_MILE, 3);
    // A highway mile is quicker.
    const fast = driveMinutes(buildRoadGraph([road('motorway', 0, 1)], origin), 30);
    expect(fast[1]).toBeCloseTo((60 / 60) * CITY_FACTOR, 3);
  });

  it('leaves out paths, tracks and rail', () => {
    const graph = buildRoadGraph([road('path', 0, 1), road('rail', 0, 2), road('track', 0, 3)], origin);
    expect(graph.edges).toHaveLength(0);
  });

  it('joins a road cut by a tile edge into one, even where the pieces share no point', () => {
    // Two pieces of one street that overlap between 1.95 and 2.05 miles, as two tiles' copies would.
    const graph = buildRoadGraph([road('minor', 0, 1, 2, 2.05), road('minor', 1.95, 3, 4)], origin);
    const times = driveMinutes(graph, 30);
    const last = graph.nodes.findIndex((node) => Math.abs(node.lng - east(4)[0]) < 1e-9);
    expect(times[last]).toBeCloseTo(4 * MINOR_MILE, 2);
  });

  it('cuts a road where each band ends, and stops at the last', () => {
    const stretches = reachedRoads(buildRoadGraph([road('minor', 0, 2, 4, 6, 8, 10)], origin), [10, 20]);
    const reach = (band: number) => Math.max(...stretches.filter((s) => s.band === band).flatMap((s) => s.coordinates.map(([lng]) => (lng - origin.lng) * milesPerLng)));
    expect(reach(10)).toBeCloseTo(10 / MINOR_MILE, 2);
    expect(reach(20)).toBeCloseTo(20 / MINOR_MILE, 2);
    expect(stretches.every((s) => s.minutes <= 20 + 1e-6)).toBe(true);
  });

  it('finds nothing when no road is near the visitor', () => {
    const far = { lat: 29.65, lng: -81.5 };
    expect(reachedRoads(buildRoadGraph([road('minor', 0, 1)], far), [10, 20])).toEqual([]);
  });
});
