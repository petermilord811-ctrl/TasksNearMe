'use client';

import { useCallback, useMemo, useState } from 'react';
import type { MapPoint, TaskMapData, TravelMode } from '@/contracts';
import { buildRoadGraph, type RoadLine } from '@/ui/landing/map/drive-times';
import { isRushHour, linesFor, routeOnRoads, RUSH_FACTOR, straightTrips, type RoadRoute, type TripEstimate } from './task-trip';
import { useDeviceLocation, type DeviceLocation } from './use-device-location';

/**
 * The task map's trip, shared by the panel and its large view: where it starts (this device, asked for by a press, or
 * a helper's home neighborhood), the estimate for each way of getting there (straight-line at once, then along the
 * roads the map loads), the chosen way and its route, and the rush-hour time at the task's start.
 */
export interface TaskTrip {
  device: DeviceLocation;
  locate: () => void;
  /** Where the trip starts now, if anywhere. */
  origin: { kind: 'device' | 'home'; point: MapPoint } | null;
  /** The person's pick, once they've made one. */
  originChoice: 'device' | 'home' | null;
  chooseOrigin: (choice: 'device' | 'home') => void;
  trips: TripEstimate[];
  mode: TravelMode;
  chooseMode: (mode: TravelMode) => void;
  /** The chosen way's line on the map: along the roads, or straight (dotted) while there's no road route. */
  route: { path: [number, number][]; basis: 'roads' | 'straight' } | null;
  /** A weekday rush hour at the task's start: the drive then, in minutes (null otherwise). */
  rushMinutes: number | null;
  /** The live map's roads around the trip (task-map-live.tsx `onRoads`). */
  onRoads: (lines: RoadLine[]) => void;
}

export function useTaskTrip(data: TaskMapData): TaskTrip {
  const { location: device, locate } = useDeviceLocation();
  const [originChoice, setOriginChoice] = useState<'device' | 'home' | null>(null);
  const [modeChoice, setModeChoice] = useState<TravelMode | null>(null);
  const [roads, setRoads] = useState<{ key: string; routes: Partial<Record<TravelMode, RoadRoute>> } | null>(null);
  const home = data.home;

  // The device once it's found (what the owner asked for: "show current location"), unless the person picked home;
  // before that, a helper's home neighborhood.
  const origin = useMemo<TaskTrip['origin']>(() => {
    if (originChoice === 'home' && home) return { kind: 'home', point: home.point };
    if (device.status === 'found' && originChoice !== 'home') return { kind: 'device', point: device.point };
    if (home && originChoice !== 'device') return { kind: 'home', point: home.point };
    return null;
  }, [originChoice, home, device]);
  const originKey = origin ? `${origin.kind}:${origin.point.lat.toFixed(4)},${origin.point.lng.toFixed(4)}` : '';

  const straight = useMemo(() => (origin ? straightTrips(origin.point, data.area.point) : []), [origin, data.area.point]);
  const routes = roads?.key === originKey ? roads.routes : {};
  const trips: TripEstimate[] = straight.map((trip) => {
    const road = routes[trip.mode];
    return road ? { mode: trip.mode, minutes: road.minutes, miles: road.miles, basis: 'roads' as const } : trip;
  });
  const mode: TravelMode = modeChoice && trips.some((trip) => trip.mode === modeChoice) ? modeChoice : 'drive';
  const chosenRoad = routes[mode];
  const route: TaskTrip['route'] = !origin
    ? null
    : chosenRoad
      ? { path: chosenRoad.path, basis: 'roads' }
      : { path: [[origin.point.lng, origin.point.lat], [data.area.point.lng, data.area.point.lat]], basis: 'straight' };

  const drive = trips.find((trip) => trip.mode === 'drive');
  const rushMinutes = drive && !data.schedule.flexible && isRushHour(new Date(data.schedule.windowStart), data.timeZone) ? Math.round(drive.minutes * RUSH_FACTOR) : null;

  const onRoads = useCallback((lines: RoadLine[]) => {
    if (!origin || lines.length === 0) return;
    const found: Partial<Record<TravelMode, RoadRoute>> = {};
    for (const trip of straightTrips(origin.point, data.area.point)) {
      try {
        const graph = buildRoadGraph(linesFor(trip.mode, lines), origin.point);
        const road = routeOnRoads(graph, data.area.point, trip.mode);
        // A road route far longer than the straight line means the loaded roads don't really connect: keep the estimate.
        if (road && road.miles <= Math.max(trip.miles * 2.2, trip.miles + 3)) found[trip.mode] = road;
      } catch {
        /* the roads didn't make a graph: the straight-line estimate stays */
      }
    }
    setRoads({ key: originKey, routes: found });
  }, [origin, originKey, data.area.point]);

  return {
    device,
    locate,
    origin,
    originChoice,
    chooseOrigin: setOriginChoice,
    trips,
    mode,
    chooseMode: setModeChoice,
    route,
    rushMinutes,
    onRoads,
  };
}
