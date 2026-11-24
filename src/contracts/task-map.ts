import type { CategorySlug, ISODateTime } from './common';
import type { PricingInput } from './money';
import type { TaskSchedule } from './tasks';

/**
 * The task map (owner, 2026-11-23: "map integration feature is only implemented in first landing page, it has to be
 * packaged as useful component and should be used as one common components in every each task page … mini map for that
 * task - show current location, drive or walk distance and estimated time, weather, nearby building infos"). One panel on
 * every task page: the task's general area on a live map, the trip there from where the viewer is (worked out on their
 * device; their location never leaves it), the weather for the task's time, and what's around the area.
 *
 * Privacy: everything here is about the general area (`PublicLocation`'s fuzzed point and circle), never the address.
 */

export interface MapPoint {
  lat: number;
  lng: number;
}

/** How much the weather matters for a kind of work: outdoor work leads with it. */
export type WeatherWeight = 'high' | 'low' | 'none';

export const TRAVEL_MODES = ['drive', 'bike', 'walk'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

/** An open task near this one, for a helper planning a trip (two tasks, one drive). */
export interface NearbyTaskPin {
  id: string;
  title: string;
  /** Where it opens: Find work's page for a helper, the public page otherwise. */
  href: string;
  point: MapPoint;
  budget: PricingInput;
  windowStart: ISODateTime;
  /** From this task's area, straight line. */
  miles: number;
  /** The same day as this task, in the market's zone. */
  sameDay: boolean;
}

export interface TaskMapData {
  taskId: string;
  area: {
    name: string;
    marketName: string;
    outsideMarket?: true;
    /** The public, fuzzed point (never the address). */
    point: MapPoint;
    radiusMeters: number;
  };
  schedule: TaskSchedule;
  /** The market's IANA zone: the task's local time (rush hour, sunset). */
  timeZone: string;
  category: CategorySlug;
  weatherWeight: WeatherWeight;
  /** A signed-in helper's home neighborhood (its center, not their address): a trip can start there. */
  home?: { name: string; point: MapPoint };
  /** Open tasks within a couple of miles, nearest first (helpers; empty for posters). */
  nearbyTasks: NearbyTaskPin[];
  /** Who's looking: the poster sees the area as helpers do; helpers plan the trip. */
  viewer: 'visitor' | 'member' | 'helper' | 'poster';
}

export const WEATHER_CONDITIONS = ['clear', 'partly-cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'showers', 'thunderstorm', 'snow', 'sleet', 'wind', 'haze'] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

export interface WeatherHour {
  /** The hour's start (UTC). */
  at: ISODateTime;
  tempF: number;
  /** What it feels like (heat index or wind chill), when it differs by 3°F or more. */
  feelsLikeF?: number;
  /** Chance of rain, 0–100. */
  rainChance: number;
  windMph: number;
  condition: WeatherCondition;
  isDaytime: boolean;
}

export type WeatherAlertSeverity = 'extreme' | 'severe' | 'moderate' | 'minor' | 'unknown';

export interface WeatherAlert {
  /** The National Weather Service's event name, e.g. "Heat Advisory" (English: the service's own words). */
  event: string;
  severity: WeatherAlertSeverity;
  ends?: ISODateTime;
}

/** What to tell the helper about the weather for this task (each a short note under the forecast). */
export const WEATHER_FLAGS = ['heat', 'cold', 'rain', 'storm', 'wind', 'dark'] as const;
export type WeatherFlag = (typeof WEATHER_FLAGS)[number];

export type TaskWeather =
  | {
      status: 'forecast';
      /** The hours of the task's window (a flexible day: its daylight hours), at most 14. */
      hours: WeatherHour[];
      summary: { lowF: number; highF: number; feelsLikeMaxF?: number; feelsLikeMinF?: number; rainChanceMax: number; windMaxMph: number; condition: WeatherCondition };
      flags: WeatherFlag[];
      alerts: WeatherAlert[];
      /** Sunset on the task's day, when the window runs within an hour of it or past it. */
      sunset?: ISODateTime;
      source: 'nws' | 'sample';
    }
  | { status: 'later'; /** When the forecast will reach the task's time. */ availableFrom: ISODateTime; alerts: WeatherAlert[]; source: 'nws' | 'sample' }
  | { status: 'past' }
  | { status: 'unavailable' };

export const PLACE_KINDS = [
  'hardware',
  'garden',
  'truck-rental',
  'storage',
  'recycling',
  'donation',
  'supermarket',
  'electronics',
  'fuel',
  'park',
  'school',
  'university',
  'hospital',
  'library',
  'mall',
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export interface TaskPlace {
  id: string;
  kind: PlaceKind;
  /** OpenStreetMap's name for it. */
  name: string;
  point: MapPoint;
  /** From the area's point, straight line. */
  miles: number;
}

export type TaskSurroundings =
  | {
      status: 'found';
      /** Named places that say where the area is (a park, a school, the campus), nearest first, at most 3. */
      landmarks: TaskPlace[];
      /** Places this kind of work may need (hardware for assembly, truck rental for a move), the nearest of each kind. */
      helpful: TaskPlace[];
      /** Parking lots inside the area. */
      parkingLots: number;
      /** What the homes are, when the map knows enough of them to say. */
      homes?: 'houses' | 'apartments' | 'mixed';
      source: 'osm' | 'sample';
    }
  | { status: 'unavailable' };

/** The task map's server data on a page: the map itself now, the weather and the surroundings as they arrive. */
export interface TaskMapBundle {
  data: TaskMapData;
  weather: Promise<TaskWeather>;
  surroundings: Promise<TaskSurroundings>;
}
